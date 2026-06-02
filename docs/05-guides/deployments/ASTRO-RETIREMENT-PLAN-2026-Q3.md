# Astro retirement plan — `apps/docs-site/` post-ADR-055

> **Stamp**: 2026-06-02 · **Status**: CANONICAL · **Authority**: [ADR-055 §7](../../02-decisions/adrs/ADR-055-one-pryzm-cloudflare-supabase.md) · **Owner**: @MarkHanoi
>
> **Purpose**: ADR-055 declares "there is one PRYZM, and it is the editor." This plan enumerates every artefact in or referencing `apps/docs-site/`, classifies it (RETIRE / KEEP / MOVE), prescribes the exact retirement sequence, and gives a verification checklist. Future engineers should be able to redo this retirement step-for-step without re-derivation.
>
> **Timing**: Steps execute at **Phase A close** (after the `pryzm.so` apex DNS flips from `pryzmapp.pages.dev` → `app.fly.dev`, per ADR-055 §3 Phase A). Each step is individually reversible until the final deletion commit.
>
> **Scope**: This doc neither deletes nor edits anything. It is the runbook + the deletion list.

---

## §1 — Inventory

The `apps/docs-site/` workspace contains the following source artefacts (build artefacts under `dist/` and `node_modules/` are excluded — they regenerate or vanish when the workspace is removed).

### §1.1 — `apps/docs-site/src/pages/` (Astro pages, customer-facing)

| Path | Classification | Post-retirement target |
|---|---|---|
| `apps/docs-site/src/pages/index.astro` | **RETIRE** | Editor `LandingPage.ts` is canonical (the source the Astro page mirrors). Delete after Phase A close. |
| `apps/docs-site/src/pages/start.astro` | **MOVE → editor** | RAC chatbot canvas. Editor work tracked under A.5.b / A.5.d / A.5.f. The Astro `/start` route deletes once the editor's RAC panel ships at `app.pryzm.so/start` (or the equivalent route). |
| `apps/docs-site/src/pages/pricing.astro` | **MOVE → editor** | Editor renders directly from `@pryzm/entitlements` (no JSON-snapshot intermediate). Tracker row A.18.b is updated to point to an editor route, not the Astro page. |
| `apps/docs-site/src/pages/manifesto.astro` | **MOVE → editor** | Editor route. Source content already lives in `docs/01-strategy/manifesto.md`; the editor reads that at build time (Vite import) instead of via JSON snapshot. |
| `apps/docs-site/src/pages/trust.astro` | **MOVE → editor** | Editor route. Same pattern as manifesto. |
| `apps/docs-site/src/pages/404.astro` | **KEEP** (qualified) | Survives ONLY if `docs.pryzm.so` (developer docs) remains. Drop the `/manifesto · /pricing · /trust` links inside this file — those routes no longer exist on `docs.pryzm.so`. If the developer-docs surface is also retired (§3 below), delete this too. |

### §1.2 — `apps/docs-site/src/content/docs/` (Starlight developer docs)

| Path | Classification | Post-retirement target |
|---|---|---|
| `apps/docs-site/src/content/docs/index.md` | **KEEP** | `docs.pryzm.so` home. |
| `apps/docs-site/src/content/docs/plugin-sdk/getting-started.md` | **KEEP** | `docs.pryzm.so/plugin-sdk/getting-started` |
| `apps/docs-site/src/content/docs/plugin-sdk/manifest.md` | **KEEP** | `docs.pryzm.so/plugin-sdk/manifest` |
| `apps/docs-site/src/content/docs/plugin-sdk/permissions.md` | **KEEP** | `docs.pryzm.so/plugin-sdk/permissions` |
| `apps/docs-site/src/content/docs/plugin-sdk/sandbox.md` | **KEEP** | `docs.pryzm.so/plugin-sdk/sandbox` |
| `apps/docs-site/src/content/docs/plugin-sdk/host-api.md` | **KEEP** | `docs.pryzm.so/plugin-sdk/host-api` |
| `apps/docs-site/src/content/docs/plugin-sdk/examples.md` | **KEEP** | `docs.pryzm.so/plugin-sdk/examples` |
| `apps/docs-site/src/content/docs/plugin-sdk/first-party-plugins.md` | **KEEP** | `docs.pryzm.so/plugin-sdk/first-party-plugins` |
| `apps/docs-site/src/content/docs/plugin-sdk/distribution.md` | **KEEP** | `docs.pryzm.so/plugin-sdk/distribution` |
| `apps/docs-site/src/content/docs/api/quickstart.md` | **KEEP** | `docs.pryzm.so/api/quickstart` |
| `apps/docs-site/src/content/docs/api/auth.md` | **KEEP** | `docs.pryzm.so/api/auth` |
| `apps/docs-site/src/content/docs/api/openapi.md` | **KEEP** | `docs.pryzm.so/api/openapi` |
| `apps/docs-site/src/content/docs/headless/getting-started.md` | **KEEP** | `docs.pryzm.so/headless/getting-started` |
| `apps/docs-site/src/content/docs/headless/api.md` | **KEEP** | `docs.pryzm.so/headless/api` |
| `apps/docs-site/src/content/docs/headless/recipes.md` | **KEEP** | `docs.pryzm.so/headless/recipes` |
| `apps/docs-site/src/content/docs/selfhost/getting-started.md` | **KEEP** | `docs.pryzm.so/selfhost/getting-started` |
| `apps/docs-site/src/content/docs/selfhost/architecture.md` | **KEEP** | `docs.pryzm.so/selfhost/architecture` |

### §1.3 — `apps/docs-site/src/data/` (build-time data snapshots)

| Path | Classification | Post-retirement target |
|---|---|---|
| `apps/docs-site/src/data/pricing.json` | **RETIRE** | The whole snapshot pattern (ADR-052 §1.4) is retired — the editor reads `@pryzm/entitlements` directly at runtime / build time. No JSON intermediate. |

### §1.4 — `apps/docs-site/src/` other

| Path | Classification | Post-retirement target |
|---|---|---|
| `apps/docs-site/src/content.config.ts` | **KEEP** | Required by Starlight content-collection schema. Survives intact under the developer-docs-only build. |

### §1.5 — `apps/docs-site/` root config

| Path | Classification | Post-retirement target |
|---|---|---|
| `apps/docs-site/astro.config.mjs` | **KEEP** (edited) | Remove the customer-facing sidebar references; keep the 4 Starlight sections (Plugin SDK / REST API / Headless / Self-Host). Update the file header banner from "marketing surface" framing to "developer docs only". |
| `apps/docs-site/package.json` | **KEEP** (edited) | Description rewritten: "PRYZM developer docs site (Astro Starlight) — docs.pryzm.so only per ADR-055 §1." Dependencies unchanged. |
| `apps/docs-site/tsconfig.json` | **KEEP** | Unchanged. |
| `apps/docs-site/INVENTORY.md` | **KEEP** (edited) | Append a "2026-06-02 / ADR-055" entry noting the customer-facing pages were retired here; the file's S63 D1 history is preserved. |
| `apps/docs-site/public/.gitkeep` | **KEEP** | Empty marker. |
| `apps/docs-site/dist/` | **REGENERATED** | Build artefact; vanishes on next build. Not a tracked decision. |
| `apps/docs-site/node_modules/` | **REGENERATED** | Same. |
| `apps/docs-site/.astro/` | **REGENERATED** | Same. |

**Inventory totals**: 6 customer-facing Astro pages (4 RETIRE / MOVE outright · 1 MOVE to editor · 1 KEEP-qualified), 17 Starlight markdown pages (all KEEP), 1 data snapshot (RETIRE), 5 config files (4 KEEP / KEEP-edited · 1 build script).

---

## §2 — Cross-references outside `apps/docs-site/`

These are the files OUTSIDE the workspace that import / reference docs-site artefacts. Each must be addressed in lockstep with the retirement.

| File:line | Reference | Classification | Action |
|---|---|---|---|
| `scripts/build/gen-docs-site-pricing.mjs` (whole file) | Generates `apps/docs-site/src/data/pricing.json` from `@pryzm/entitlements`. | **RETIRE** | Delete the script. The editor reads `@pryzm/entitlements` directly — no JSON-snapshot indirection. |
| `package.json:32` — script `"gen:docs-site-pricing": "node scripts/build/gen-docs-site-pricing.mjs"` | npm script entry. | **RETIRE** | Remove the line. |
| `packages/entitlements/src/pricingPage.ts:8` — comment `// The L5 component (\`apps/docs-site/src/pricing.tsx\`) imports this` | Header comment referencing the now-deleted consumer. | **KEEP (edit comment)** | Update comment: "Consumed by the editor's pricing route (`apps/editor/src/ui/platform/PricingPage.ts`). Previously also consumed by the retired Astro pricing page — see ADR-055." |
| `packages/entitlements/package.json:4` — long `"description"` mentions `apps/docs-site/src/pricing.tsx` | Package description string. | **KEEP (edit description)** | Replace the `apps/docs-site/src/pricing.tsx` substring with `apps/editor/src/ui/platform/PricingPage.ts`. |
| `.dockerignore:72-73` — `# docs-site is a separate Astro app — out of scope for the editor image.` + `apps/docs-site` | Excludes the Astro app from the editor Docker image. | **KEEP (edit comment)** | The exclusion still applies (the docs-site stays separate). Update the comment to reference ADR-055: `# docs-site is the developer-docs-only Astro app per ADR-055 — out of scope for the editor image.` |
| `docs/05-guides/deployments/CLOUDFLARE-PAGES-SETUP.md` (whole file) | Runbook for the original customer-facing `pryzm.so` Cloudflare Pages project. | **KEEP (edit + redirect)** | Add a top-of-doc SUPERSEDED-BY-ADR-055 banner. Re-scope §7 (custom domain) from `pryzm.so` to `docs.pryzm.so`. Add a §14 "Phase A retirement" appendix linking to this doc. |
| `docs/03-execution/plans/master-execution-tracker.md:356-358` — A.18, A.18.a, A.18.b rows | Tracker rows referencing `apps/docs-site/src/pages/pricing.astro` as the L5 surface. | **KEEP (edit rows)** | Repoint A.18.b's "current surface" cell to `apps/editor/src/ui/platform/PricingPage.ts` (new). Mark "Migrated per ADR-055 §7 at Phase A close." |
| `docs/03-execution/plans/master-execution-tracker.md:121` — IP-A5 row `🎯 1 — REACHED 2026-06-02` | The closure record cites the four Astro pages as the deliverable. | **KEEP (annotate)** | Append a 2026-Q3 footnote: "The Astro-served version of these pages was a Phase-A bridge per ADR-055 §3. After Phase A close the same four surfaces are served from the editor; the bridge artefacts are retired per this plan." Do not edit the historical claim — it was true at the time. |
| `docs/03-execution/plans/PHASE-A-USER-CAPABILITIES-AND-TEST-PLAN.md:146` — `grep apps/docs-site/src/pages/pricing.astro — only buildPricingPageData() consumed` | Test-plan assertion. | **KEEP (edit row)** | Repoint the grep target to `apps/editor/src/ui/platform/PricingPage.ts`. |
| `CLAUDE.md:64` — `L5 apps/* (14) — per-app surfaces (editor, marketplace, workers, docs-site…)` | Layer enumeration. | **KEEP (no edit needed)** | `docs-site` survives as the developer-docs app. The line stays accurate. |
| `replit.md:23` + `:62` — references docs-site as a workspace app and as the home of headless mode documentation | Replit-platform readme. | **KEEP (edit)** | Update line 62 to clarify "developer docs at `docs.pryzm.so` (consumer-facing surfaces moved into the editor per ADR-055)." |
| `pnpm-lock.yaml` (many lines) | Workspace lockfile entries for `@pryzm/docs-site`. | **REGENERATED** | Will auto-update on the next `pnpm install` after `package.json` edits land. Don't hand-edit. |
| `packages/api-spec/openapi.yaml` (mention) | Cross-reference to Starlight rendering site. | **KEEP** | The openapi spec still feeds `docs.pryzm.so/api/openapi`. No change. |
| `packages/api-spec/__tests__/openapi-smoke.test.ts` (mention) | Smoke test against the docs surface. | **KEEP** | Still valid — points at the surviving developer-docs site. |
| `tests/ga-gate/__tests__/release-artefacts.test.ts` (mention) | GA-gate test referencing docs-site build artefact. | **VERIFY** | Read the test; if it asserts the customer-facing pages exist (`/`, `/pricing`, `/manifesto`, `/trust`), repoint those assertions to the editor app. If it asserts only the Starlight build is green, no change. |
| `docs/02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md` + C39 + C40 + C41 + C43 + C45 + C46 + C49 (mentions) | Contract docs reference docs-site as the publication target. | **KEEP (light edit)** | Each contract that points at the Astro marketing pages needs a one-line "post-ADR-055 the surface moved into the editor" note. Many contracts mention `docs-site` only for developer docs — those stay verbatim. Audit each contract individually in step §7 below. |
| `docs/archive/pryzm3-internal/**` (multiple) | Historical archive of phase audits. | **KEEP (no edit)** | Archive — preserves historical state intentionally. Leave verbatim. |
| `docs/02-decisions/adrs/0039-s63-public-api-and-docs-site-foundation.md` | The ADR that created the docs-site workspace. | **KEEP (no edit)** | ADR-0039 created the developer-docs portion (which survives). The customer-facing layer was added by ADR-052, retired by ADR-055. Do not edit ADR-0039 — its scope is the surviving portion. |
| `docs/02-decisions/adrs/0042-s65-ai-public-api.md` · `0048-s67-self-host-docker-compose.md` · `0053-s71-perf-regression-hunt-and-hardfail-flip.md` · `0054-s72-m36-ga-launch-gate.md` | Phase-3 ADRs that reference the docs-site as a publication target. | **KEEP (no edit)** | They reference developer docs (Plugin SDK / API / Self-Host / GA gate). Surviving surfaces. |

**The trickiest cross-reference**: `scripts/build/gen-docs-site-pricing.mjs` + its `package.json` script entry + the comment in `packages/entitlements/src/pricingPage.ts` + the `packages/entitlements/package.json` description form a four-file knot describing the *snapshot pattern* — the build-time JSON intermediate that exists only because the original Astro project couldn't import `@pryzm/schemas`/`zod@4` at build time (Starlight 0.30 pinned `zod@3`). When the editor takes over, no snapshot is needed (the editor's Vite bundle already pulls `@pryzm/schemas`). All four references must retire together or you leave behind a dead npm script that references a deleted file.

---

## §3 — Cloudflare Pages project disposition

### §3.1 — Current state

The Cloudflare Pages project is named **`pryzmapp`** (per the session history record in [CLOUDFLARE-PAGES-SETUP.md](./CLOUDFLARE-PAGES-SETUP.md) and the deploys at `pryzmapp.pages.dev`). It currently serves:

- **`pryzm.so`** apex (CNAME-flat → `pryzmapp.pages.dev`)
- **`www.pryzm.so`** → 301 redirect → apex
- The static build of `apps/docs-site/dist/` containing: `/`, `/start`, `/pricing`, `/manifesto`, `/trust`, `/404`, plus the entire Starlight developer-docs tree (`/plugin-sdk/*`, `/api/*`, `/headless/*`, `/selfhost/*`).

### §3.2 — Phase A close — what changes

| Question | Answer |
|---|---|
| Does the `pryzmapp` Pages project stay? | **Decision: KEEP, RECONFIGURE.** Re-scope the project to serve only `docs.pryzm.so`. Build settings unchanged (still `pnpm --filter @pryzm/docs-site exec astro build`). Custom-domain wiring re-pointed in §4. |
| Could we instead delete it entirely? | Yes — if a future decision retires the developer docs (or moves them under the editor at `app.pryzm.so/docs`). Today's recommendation is keep-and-reconfigure because the developer-docs portion is real, used, and Astro Starlight is a fine host for it. |
| What about cost? | Cloudflare Pages free tier remains. The reconfigured project serves a fraction of the original traffic (developer docs, not customer landing). Build budget falls well below the 500/mo free-tier cap. |
| What if the developer docs (`docs.pryzm.so`) are retired later? | At that point: delete the `pryzmapp` Pages project AND the whole `apps/docs-site/` workspace. A future ADR would supersede ADR-055 §1 to allow that. |

### §3.3 — Build settings — pre-flip vs post-flip

| Setting | Pre-flip (today) | Post-flip (Phase A close) |
|---|---|---|
| Project name | `pryzmapp` | `pryzmapp` (rename optional: `pryzm-docs`) |
| Production branch | `main` | `main` |
| Build command | `pnpm install --no-frozen-lockfile && pnpm --filter @pryzm/docs-site exec astro build` | unchanged |
| Build output dir | `apps/docs-site/dist` | unchanged |
| Custom domains | `pryzm.so` + `www.pryzm.so` + (reserved) `docs.pryzm.so` | **only** `docs.pryzm.so` |
| Env vars | `NODE_VERSION=20`, `NPM_FLAGS=--version`, `SKIP_DEPENDENCY_INSTALL=true` | unchanged |

---

## §4 — DNS record changes (Phase A close)

All managed in Cloudflare. The flip is atomic at the apex; the redirect record is updated in the same change-window.

| Record | Before | After (Phase A close) | Reason |
|---|---|---|---|
| `pryzm.so` (apex) | `CNAME-flat → pryzmapp.pages.dev` | `CNAME-flat → app.fly.dev` (Phase A) → later `pryzm.pages.dev` (Phase B per ADR-055 §5) | Apex now serves the editor. |
| `www.pryzm.so` | 301 → `pryzm.so` | unchanged (still 301 → apex) | Subdomain canonicalisation unchanged. |
| `docs.pryzm.so` | NEW — does not exist yet | `CNAME → pryzmapp.pages.dev` (or `pryzm-docs.pages.dev` if renamed) | New developer-docs surface. Provisioned **before** the apex flip so docs links keep working. |
| `app.pryzm.so` | reserved (no record) | (decision deferred; ADR-055 §5 keeps it reserved) | Phase A serves the editor at the apex itself; `app.pryzm.so` reserved for Phase B+ if we want to separate marketing-vs-editor surfaces later. |
| `api.pryzm.so` | reserved (no record) | reserved | Phase C cutover destination (Pages Functions). |
| `staging.pryzm.so` | reserved (no record) | reserved | Phase B preview/staging. |
| `marketplace.pryzm.so` | reserved (no record) | reserved | A.14 — gated on npm token. |

**Pre-flip sequence** (important — DON'T flip the apex first):

1. Create `docs.pryzm.so` CNAME → `pryzmapp.pages.dev`.
2. Wait for TLS auto-issue (~30-60s).
3. Verify `curl -I https://docs.pryzm.so/plugin-sdk/getting-started` returns 200.
4. THEN flip the apex `pryzm.so` CNAME to `app.fly.dev`.
5. Within 1-5 min DNS propagation, `pryzm.so` resolves to the editor.

**Reversibility**: keep the apex CNAME's prior value (`pryzmapp.pages.dev`) noted in the change-window log. Reverting is a single Cloudflare-dashboard click + 1-5 min propagation.

---

## §5 — CI workflows affected

### §5.1 — `.github/workflows/ci.yml`

`grep docs-site` returns **0 matches** in the workflow file. No GitHub Actions workflow currently builds or deploys the docs-site. The Cloudflare Pages auto-deploy is wired directly from GitHub repo events (push to `main`) — it sits OUTSIDE the GitHub Actions surface.

**Action**: **none required** in `.github/workflows/`. The retirement is entirely a Cloudflare-side reconfiguration.

### §5.2 — `tests/ga-gate/__tests__/release-artefacts.test.ts`

Grep hit; classification per §2 is **VERIFY**. If the test asserts the customer-facing routes (`/`, `/pricing`, `/manifesto`, `/trust`) exist in the built `apps/docs-site/dist/`, those assertions need to either:

- Be retargeted to the editor's built dist (e.g. `apps/editor/dist/`), OR
- Be removed if the editor doesn't pre-render those routes (Vite SPA — pre-render happens in Phase B per ADR-055 §3).

Read the test before deciding; if removed, replace with a Phase-B follow-up test.

### §5.3 — Future CI guard: `scripts/check/check-no-duplicate-surfaces.mjs`

ADR-055 §1 promises this gate "in the next iteration." It is NOT yet on disk (`Glob scripts/check/check-no-duplicate-surfaces.mjs` returns nothing). The retirement does not depend on it shipping first — the gate exists to prevent future regression after retirement is complete. Track as a separate sub-slice (e.g. A.55.gate).

### §5.4 — `package.json` root `"scripts"`

The `gen:docs-site-pricing` script (line 32) is the only docs-site-aware build-side script entry. Removed as part of §2 row 2.

---

## §6 — Documentation that needs a SEE ADR-055 pointer

Each of the following must add a one-line "SEE [ADR-055](../../02-decisions/adrs/ADR-055-one-pryzm-cloudflare-supabase.md)" pointer at the top (or in the relevant section). The doc is otherwise preserved for historical accuracy.

| Doc | Where to add the pointer | Reason |
|---|---|---|
| `docs/02-decisions/adrs/ADR-052-docs-site-marketing-surface.md` | Already done — ADR-055 §0 stamps ADR-052 as SUPERSEDED. Verify the stamp landed in the ADR-052 file itself. | The original decision; reverse-link is mandatory. |
| `docs/05-guides/deployments/CLOUDFLARE-PAGES-SETUP.md` | Add top-of-doc banner: `> POST-ADR-055: This runbook now applies to docs.pryzm.so only. The apex pryzm.so flip is documented in CLOUDFLARE-MIGRATION-RUNBOOK-2026-Q3.md.` Re-scope §7 wording from `pryzm.so` to `docs.pryzm.so`. | Was the apex-deploy runbook; is now the developer-docs runbook. |
| `docs/03-execution/plans/master-execution-tracker.md` (rows A.18 / A.18.a / A.18.b at lines 356-358) | Append `· **2026-Q3 (Phase A close)**: surface moved to editor per [ADR-055 §7](../../02-decisions/adrs/ADR-055-one-pryzm-cloudflare-supabase.md). Astro `pricing.astro` retired.` | Tracker is the working catalogue; needs accuracy. |
| `docs/03-execution/plans/master-execution-tracker.md` (IP-A5 row at line 121) | Append a 2026-Q3 footnote (see §2 row). | Historical record stays; forward-pointer added. |
| `docs/03-execution/plans/PHASE-A-USER-CAPABILITIES-AND-TEST-PLAN.md` line 146 | Repoint the grep target from `apps/docs-site/src/pages/pricing.astro` to `apps/editor/src/ui/platform/PricingPage.ts`. | Test plan is a living doc. |
| `CLAUDE.md` | No mandatory edit (line 64 description still accurate). Optional: add a one-line note in the architecture section mentioning ADR-055's "one-product-surface" rule. | The 8-layer model still names `docs-site` as an L5 app — true for the developer-docs surface. |
| `replit.md` lines 23 + 62 | Add "developer docs only per ADR-055" qualifier to line 62. | Platform readme. |
| `docs/04-reference/architecture-detail/02-FILE-STRUCTURE.md` | Add ADR-055 cross-reference in the `apps/` section. | Reference doc must stay in sync. |
| `docs/04-reference/architecture-detail/03-FINAL-MAP.md` | Same. | Same. |
| `docs/01-strategy/architecture.md` + `architecture-breakdown.md` + `engineering-vision.md` | Add a one-line "see ADR-055 for the one-surface rule" where the architecture is enumerated. | Strategy docs anchor newcomers. |
| `docs/01-strategy/README.md` | One-line `> 2026-Q3: customer-facing surfaces consolidated into the editor per ADR-055.` | Index doc. |
| `docs/02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md` §1.13 | Replace the "Astro page consumes the JSON snapshot" sentence with "the editor renders `buildPricingPageData()` directly at build time." | C39 explicitly mentioned the snapshot path — must track. |
| `docs/02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md` · `C41-TELEMETRY-AND-ANALYTICS.md` · `C43-ACCESSIBILITY.md` · `C45-BROWSER-AND-DEVICE-MATRIX.md` · `C46-I18N-AND-L10N.md` · `C49-MULTI-REGION-AND-SOVEREIGNTY.md` | Each contract has a one-line `docs-site` reference (usually as the canonical publication target). Audit each: if the reference is to developer docs (Plugin SDK / API / Self-Host) it stays; if it's to the marketing surface, repoint to the editor route. | Contracts are merge-blocking. |
| `docs/README.md` + `docs/NAMING-CONVENTIONS.md` | If they mention the marketing surface, repoint. | Top-level docs. |
| `docs/05-guides/README.md` | Add the link to this retirement plan. | Index. |
| `docs/DOCUMENTATION-GAPS-AND-NEXT-PHASES.md` | Add a one-line "marketing-surface consolidation per ADR-055" entry. | Gap-tracker. |
| `docs/03-execution/status/senior-architect-audit.md` · `docs/03-execution/plans/roadmap-phase-1-alpha.md` | One-line note. | Plan docs. |
| `docs/04-reference/security/scans-2026-Q4-baseline.md` | If it scans `apps/docs-site/`, add a note that the workspace's scope shrank. | Security scan record. |
| `docs/01-strategy/manifesto.md` | No edit (canonical source — the surface moved, the content didn't). | Source of truth for the manifesto page content. |

Archive docs (`docs/archive/**`) — **DO NOT EDIT**. They are historical by design.

---

## §7 — Retirement sequence (the actual deletion order)

Each step is individually reversible (revert the commit, redeploy). Steps **must execute in order** — early steps establish the routing prerequisites that later steps depend on.

### Step 1 — Pre-flight (no deletions yet)

1.1. Confirm `app.fly.dev` (the Phase A editor deploy) is green: `curl -I https://app.fly.dev/` → 200.
1.2. Confirm `pryzm.so` still serves the Astro pages (baseline): `curl -I https://pryzm.so/pricing` → 200.
1.3. Snapshot the current Cloudflare DNS records (CSV export from the dashboard) — this is the rollback target.

### Step 2 — Editor adds the four surfaces (NOT a deletion — additive)

2.1. Land the editor's `LandingPage.ts` polish + `/pricing` + `/manifesto` + `/trust` routes. Tracker rows A.M.1-A.M.4 + A.18.b (editor variant).
2.2. Verify each route in the editor's local dev server: `npm run dev` then `curl -I http://localhost:5000/pricing` etc → 200.
2.3. Merge to `main`. Fly auto-deploys.
2.4. Verify on Fly: `curl -I https://app.fly.dev/pricing` → 200, content identical to today's `pryzm.so/pricing`.

### Step 3 — Provision `docs.pryzm.so` BEFORE flipping the apex

3.1. Cloudflare Pages dashboard → `pryzmapp` project → Custom domains → Add `docs.pryzm.so`.
3.2. Add the DNS record (auto-created or manual): `docs.pryzm.so CNAME pryzmapp.pages.dev`.
3.3. Wait for TLS issue (~30-60s).
3.4. Verify `curl -I https://docs.pryzm.so/plugin-sdk/getting-started` → 200.
3.5. **Decision point**: links from old `pryzm.so/plugin-sdk/...` URLs will 404 after Step 4 (apex no longer routes to Astro). If external links / search-engine results matter, configure a Cloudflare redirect rule: `pryzm.so/plugin-sdk/* → docs.pryzm.so/plugin-sdk/$1` (and same for `api/*`, `headless/*`, `selfhost/*`).

### Step 4 — Flip the apex (DNS, atomic)

4.1. Cloudflare DNS → `pryzm.so` (apex) → change CNAME from `pryzmapp.pages.dev` to `app.fly.dev`.
4.2. Within 1-5 min, `curl -I https://pryzm.so/` resolves to the editor.
4.3. Verify all four canonical surfaces: `/`, `/pricing`, `/manifesto`, `/trust` → 200, served from Fly.

**Phase A is now live. From this point the retirement begins.**

### Step 5 — Remove the Cloudflare custom-domain mapping

5.1. `pryzmapp` Pages project → Custom domains → Remove `pryzm.so`.
5.2. Remove `www.pryzm.so` (or repoint to `pryzm.so` apex — already covered by §4 table).
5.3. The Pages project now serves only `docs.pryzm.so` + the auto-generated `pryzmapp.pages.dev` preview URL.

### Step 6 — Edit the docs-site workspace (still building, narrower scope)

6.1. **Delete** `apps/docs-site/src/pages/index.astro`.
6.2. **Delete** `apps/docs-site/src/pages/pricing.astro`.
6.3. **Delete** `apps/docs-site/src/pages/manifesto.astro`.
6.4. **Delete** `apps/docs-site/src/pages/trust.astro`.
6.5. **Delete** `apps/docs-site/src/pages/start.astro`.
6.6. **Edit** `apps/docs-site/src/pages/404.astro` — drop the `/manifesto · /pricing · /trust` links from the bottom links list; the page now offers only `/` (Starlight home).
6.7. **Delete** `apps/docs-site/src/data/pricing.json`.
6.8. **Edit** `apps/docs-site/INVENTORY.md` — append a Phase-A-close section noting the retirement.
6.9. **Edit** `apps/docs-site/package.json` — rewrite the `"description"` field.
6.10. **Edit** `apps/docs-site/astro.config.mjs` — update header comment to "developer docs only per ADR-055."
6.11. Local verify: `pnpm --filter @pryzm/docs-site exec astro build` → green; output contains only `/plugin-sdk/*`, `/api/*`, `/headless/*`, `/selfhost/*`, `/404`.

### Step 7 — Remove the build glue

7.1. **Delete** `scripts/build/gen-docs-site-pricing.mjs`.
7.2. **Edit** root `package.json` — remove the `"gen:docs-site-pricing"` script entry (line 32).
7.3. **Edit** `packages/entitlements/src/pricingPage.ts` — update the line-8 comment to point at the editor route.
7.4. **Edit** `packages/entitlements/package.json` — replace `apps/docs-site/src/pricing.tsx` in the description with `apps/editor/src/ui/platform/PricingPage.ts`.
7.5. **Edit** `.dockerignore` — update line-72 comment to reference ADR-055.
7.6. `pnpm install` → regenerates lockfile.
7.7. `pnpm run check:isolation` → green.
7.8. `pnpm run lint` → green.

### Step 8 — Doc sweep (per §6)

8.1. Edit each doc enumerated in §6 in a single PR titled "docs: post-ADR-055 sweep — pointer updates."
8.2. Verify no broken Markdown links via the docs link-checker (if one exists in CI).

### Step 9 — Final verification

Run the §8 checklist below. If any item is red, revert the failing step's commit and diagnose.

---

## §8 — Verification checklist (after retirement)

Execute after Step 9 of §7. Tick each box as it passes.

- [ ] `curl -I https://pryzm.so/` → 200, served from Fly (`server` header or response identifies the editor).
- [ ] `curl -I https://pryzm.so/pricing` → 200, content rendered by the editor (table from `@pryzm/entitlements`, not the static Astro template).
- [ ] `curl -I https://pryzm.so/manifesto` → 200, editor surface.
- [ ] `curl -I https://pryzm.so/trust` → 200, editor surface.
- [ ] `curl -I https://pryzm.so/start` → 200 OR 302 to the editor's RAC chatbot route (whichever A.5.d landed).
- [ ] `curl -I https://pryzm.so/plugin-sdk/getting-started` → 301/302 redirect to `https://docs.pryzm.so/plugin-sdk/getting-started` (Step 3.5 redirect rule).
- [ ] `curl -I https://docs.pryzm.so/plugin-sdk/getting-started` → 200, Starlight content.
- [ ] `curl -I https://docs.pryzm.so/api/openapi` → 200.
- [ ] `curl -I https://docs.pryzm.so/headless/getting-started` → 200.
- [ ] `curl -I https://docs.pryzm.so/selfhost/getting-started` → 200.
- [ ] `apps/docs-site/src/pages/` contains only `404.astro` (or empty if 404 was also retired).
- [ ] `apps/docs-site/src/data/` does not exist OR contains only the `.gitkeep`.
- [ ] `scripts/build/gen-docs-site-pricing.mjs` does not exist.
- [ ] Root `package.json` has no `"gen:docs-site-pricing"` entry.
- [ ] `grep -r 'apps/docs-site/src/pages/(index|start|pricing|manifesto|trust)\.astro' docs/` returns 0 matches (or only in `docs/archive/**`).
- [ ] Cloudflare Pages project `pryzmapp` Custom-domains tab shows only `docs.pryzm.so`.
- [ ] Cloudflare DNS: `pryzm.so` apex CNAME → `app.fly.dev` (or `pryzm.pages.dev` after Phase B).
- [ ] Master tracker (`master-execution-tracker.md`) rows A.18 / A.18.a / A.18.b updated with the 2026-Q3 footnote pointing at the editor.
- [ ] Master tracker IP-A5 row carries the 2026-Q3 footnote noting the apex bridge artefacts were retired.
- [ ] `PHASE-A-USER-CAPABILITIES-AND-TEST-PLAN.md` line 146 grep target is `apps/editor/src/ui/platform/PricingPage.ts`.
- [ ] No 404s in Cloudflare Pages analytics for `docs.pryzm.so` in the first 24h after flip.
- [ ] Google Search Console (if wired) shows the redirect chain `pryzm.so/plugin-sdk/* → docs.pryzm.so/plugin-sdk/*` is recognised, not flagged as a soft-404.
- [ ] `pnpm run build` (root) green.
- [ ] `pnpm run lint` green.
- [ ] `pnpm run check:isolation` green.
- [ ] `pnpm --filter @pryzm/docs-site exec astro build` green; output contains only the Starlight developer-docs tree.
- [ ] CI on `main` green for one full sprint after retirement (catches any test that fixed-string-matched the Astro pages).

---

## §9 — Rollback playbook

If §8 verification fails or a regression is reported within the first 24h:

1. **DNS-level rollback** (fastest, 1-5 min): revert the `pryzm.so` apex CNAME from `app.fly.dev` back to `pryzmapp.pages.dev`. The Astro pages serve again. The editor's `pryzm.so` routes 404 (acceptable while diagnosing).
2. **Workspace-level rollback** (commit-revert): `git revert <retirement-commits-range>` restores the deleted Astro pages + the pricing snapshot + the gen script + the doc edits. Re-run `pnpm install` to restore the lockfile.
3. **Cloudflare-level rollback**: re-add `pryzm.so` to the `pryzmapp` Pages project's Custom domains tab.

Reversibility is preserved through Step 5 (custom-domain unmap is the last point where everything still exists). After Step 6 (file deletions land), rollback requires `git revert` — still fast, but requires a redeploy.

---

## §10 — Change log

- **2026-06-02** — Plan authored at ADR-055 acceptance. Awaiting Phase A close to execute.
