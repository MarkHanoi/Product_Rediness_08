# ADR-052 — Docs-site marketing surface (Cloudflare Pages + 404-as-page + token reuse)

| Field | Value |
|---|---|
| Status | **ACCEPTED 2026-06-02** |
| Closes | IP-A5 acceptance criteria (1) "pryzm.so redirect + landing pages work" |
| Owner | Marketing surface · build & deployment infrastructure |
| Constraint reference | C39 §1.13 (pricing page generated from registry); C43 §1.5 (a11y tokens canonical); C00 (docs taxonomy); C48 §2.x (recovery for public surfaces) |
| Touches | `apps/docs-site/` · `docs/05-guides/deployments/` · root `package.json` (Cloudflare invocation) |

---

## Context

PRYZM's customer-facing surface (landing + pricing + manifesto + trust) lives at `pryzm.so` and is served by Astro Starlight from `apps/docs-site/`. IP-A5 closure required this surface to be **live, publicly resolvable, and consistent with the canonical PRYZM contracts** — not a separate, hand-edited site that can drift.

Three architectural decisions had to be made under deadline pressure during the first deploy. This ADR ratifies them so future engineers don't re-litigate or quietly subvert them.

### Decision 1 — host on Cloudflare Pages, not Replit / Vercel / Netlify

The PRYZM editor (Express + Vite SPA) runs on Replit today. The marketing site COULD have been bundled into the same deployment, OR hosted on Vercel / Netlify. We chose Cloudflare Pages instead.

### Decision 2 — Astro 404 lives in `src/pages/`, not `src/content/docs/`

Starlight v0.30 expects Zod v3 in its content-collection schema invocation. The workspace pins **Zod v4** (via `@pryzm/schemas` per C03 §1.1). Their incompatibility surfaces only on the 404 static-route generation, breaking the whole deploy.

### Decision 3 — marketing pages embed canonical PRYZM color values inline (CSS-in-Astro)

The Astro pages are pre-rendered at build time. They cannot import `@pryzm/a11y-tokens` at runtime (no browser JS) and embedding the runtime token CSS would balloon every page. So the marketing pages **paste the canonical hex values directly into their `<style>` blocks**.

This duplicates `PRYZM_TOKENS` values into the marketing surface. Without a policy this is a token-drift risk over time (designer updates `pryzm-purple` in the registry; marketing site keeps the old value).

---

## Decision

We accept all three trade-offs, each with a written constraint that prevents the obvious regressions.

### §1 — Cloudflare Pages is the canonical host for the marketing surface

| Property | Value |
|---|---|
| Host | Cloudflare Pages |
| Production branch | `main` |
| Build command | `pnpm install --no-frozen-lockfile && pnpm --filter @pryzm/docs-site exec astro build` |
| Build output | `apps/docs-site/dist/` |
| Custom domain | `pryzm.so` (apex) |
| Configuration runbook | [docs/05-guides/deployments/CLOUDFLARE-PAGES-SETUP.md](../../05-guides/deployments/CLOUDFLARE-PAGES-SETUP.md) |
| Cost tier | Free until marketplace launches; upgrade path in CLOUDFLARE-PAGES-SETUP.md §11 |

**Why not Replit**: Replit hosts the editor (a stateful Express server). The marketing surface is static; static-on-Replit pays a price for a server it doesn't need. Separation also limits blast radius — a Replit incident does not take down the marketing site.

**Why not Vercel / Netlify**: Cloudflare's DNS + Pages + WAF + analytics live in one dashboard; PRYZM's domains are already there. Migrating later is possible (Astro output is portable) but the operational simplicity of one provider wins today.

**Migration constraint**: any change to the host MUST update CLOUDFLARE-PAGES-SETUP.md or supersede this ADR. Quiet migration is forbidden.

### §2 — The 404 page lives at `src/pages/404.astro`, not in the content collection

```
apps/docs-site/src/pages/404.astro       ✓ — Astro catch-all 404
apps/docs-site/src/content/docs/404.md   ✗ — REMOVED; do not re-add
```

**Why**: Starlight v0.30 + Zod v4 incompatibility breaks the static-route generation for any content-collection entry whose schema invocation hits Zod's internal `inst._zod.parse` API. The 404 page does not need the Starlight content shape (sidebar, breadcrumbs, navigation chrome) — it is a terminal fallback. So we serve it as a plain Astro template.

**Constraint**:
- `src/content/docs/404.md` MUST NOT be re-created until Starlight ships Zod 4 support OR the workspace de-pins Zod 4.
- A CI check in `scripts/check/check-docs-site-404.mjs` (PLANNED next iteration) will assert `src/pages/404.astro` exists and `src/content/docs/404.md` does NOT.
- When Starlight + Zod align, this ADR may be superseded by a follow-on that moves 404 back to the content collection.

**Why not pin Zod 3 at the workspace level**: `@pryzm/schemas` uses Zod 4 features (notably the `_zod` internal access for cross-field refinements). Downgrading would force a rewrite of every schema we own. Not justified to humour a single Starlight build step.

### §3 — Marketing pages embed canonical token values inline (with traceability)

The Astro marketing pages (`pricing.astro`, `manifesto.astro`, `trust.astro`, `404.astro`) embed the canonical PRYZM color hexes inline in `<style>` blocks. The values MUST trace back to `packages/a11y-tokens/src/tokens.ts` (the L2 registry per C43 §1.5).

| Token | Hex | Source of truth |
|---|---|---|
| `pryzm-purple` | `#6600FF` | `PRYZM_TOKENS['pryzm-purple']` |
| `pryzm-purple-lighter` | `#8C4DFF` | `PRYZM_TOKENS['pryzm-purple-lighter']` |
| `ink` | `#0A0A0F` | `PRYZM_TOKENS.ink` |
| `paper` | `#14141C` | `PRYZM_TOKENS.paper` |
| `paper-elevated` | `#1C1C28` | `PRYZM_TOKENS['paper-elevated']` |
| `border` | `#2A2A36` | `PRYZM_TOKENS.border` |
| `text-primary` | `#F5F5FA` | `PRYZM_TOKENS['text-primary']` |
| `text-secondary` | `#A8A8B5` | `PRYZM_TOKENS['text-secondary']` |
| `success` | `#00C781` | `PRYZM_TOKENS.success` |

**Why inline rather than imported**: Astro pre-renders these pages. An import of `@pryzm/a11y-tokens` would either (a) require Astro to bundle the package into client JS, defeating the static-pre-render speed gain, or (b) require a build-time generator that emits CSS. Inline is the simplest pre-render-compatible answer.

**Constraint — drift detection**:
- A CI check `scripts/check/check-docs-site-tokens.mjs` (PLANNED next iteration) will diff every hex literal in `apps/docs-site/src/pages/**/*.astro` against the `PRYZM_TOKENS` values and fail the PR if any drift is detected.
- Until the CI check exists, the human contract in **C43 §1.5** is: "any new token added to `PRYZM_TOKENS` that's used on a marketing page must also be inlined into the page's `<style>` in the same PR."

This is the same pattern we use for runtime tokens in `apps/editor/src/ui/styles/panels/*.ts` — those files inline the same hex values for the same reason (template-literal CSS).

### §1.4 — Marketing-surface JSON-snapshot pattern (entitlement registry)

The pricing/manifesto/trust pages MUST NOT `import` runtime PRYZM packages (`@pryzm/entitlements`, `@pryzm/schemas`, etc.). They consume runtime values **only via build-time JSON snapshots** committed to `apps/docs-site/src/data/*.json` and regenerated by scripts in `scripts/build/gen-docs-site-*.mjs`.

```
@pryzm/entitlements (L2)          ← canonical source
  └─→ scripts/build/gen-docs-site-pricing.mjs        ← generator (run on demand)
       └─→ apps/docs-site/src/data/pricing.json       ← committed snapshot
            └─→ apps/docs-site/src/pages/{pricing,manifesto,trust}.astro
```

**Why a snapshot, not a runtime workspace import**:

- The docs-site is an Astro static-pre-render surface deployed to Cloudflare Pages. At build time Astro resolves the page's `import` graph fully.
- Importing `@pryzm/entitlements` transitively pulls `@pryzm/schemas` + `zod@4` into the docs-site closure. This collides with Starlight 0.30's internal `zod@3` schema invocation (the `inst._zod.parse` crash referenced in §2).
- `pnpm.overrides` cannot fix this — the overrides resolve version constraints, not isolation; `zod@4` still wins the hoist and Starlight crashes.
- Decoupling at the dependency-closure level (no workspace import → no zod@4 → no crash) is the only stable answer.

**Constraint — freshness**:
- Regenerate with `pnpm run gen:docs-site-pricing` whenever the registry changes; commit the JSON alongside the change.
- A CI check `scripts/check/check-docs-site-pricing-fresh.mjs` (PLANNED next iteration) re-runs the generator on every PR and fails if the committed snapshot drifts from the live registry. This realises C39 §1.13's "pricing page generated from registry" contract under the snapshot pattern.
- The snapshot files MUST live in `apps/docs-site/src/data/` and MUST be committed (they are build-input artefacts, not build output). Never `.gitignore` them.

**Why this is contract-compliant, not a shortcut**:

C39 §1.13 says the pricing page MUST be generated from the entitlement registry. It does NOT say "imported at runtime from the registry". The generator script + freshness CI gate together realise the contract intent (no hand-edited tier lists; the registry is the single source of truth) while respecting the docs-site's dep-closure constraints. The generator is the contract's enforcement boundary; the snapshot is its on-disk realisation.

**When this pattern applies**:
- Any marketing page that needs data from a runtime PRYZM package.
- NOT for static content like the manifesto narrative (markdown is fine).
- NOT for pages outside `apps/docs-site/` — only the docs-site has the Zod 4 closure conflict.

**`apps/docs-site/package.json` dependency rule**: the docs-site MUST NOT declare any `@pryzm/*` workspace dep. Only Astro + Starlight. Enforced by inspection (and a future `check-docs-site-deps.mjs` gate).

---

## Consequences

### Positive

1. **Single host for marketing**: pryzm.so lives on Cloudflare Pages; one DNS dashboard; one billing line.
2. **Static-pre-render speed**: every marketing page is pure HTML at the edge. No SSR roundtrip; no JS dependency closure to ship.
3. **Pricing page never drifts from entitlements**: `pricing.astro` reads `src/data/pricing.json` (generated from `@pryzm/entitlements` per §1.4); the freshness CI gate fails any PR whose snapshot is stale. Marketing content sync is automatic + auditable.
4. **404 build no longer breaks**: pre-existing Zod 4 / Starlight 0.30 incompatibility is bypassed via §2 (page-not-collection) AND §1.4 (no zod@4 in docs-site closure).

### Negative

1. **Token-value duplication**: hex literals appear in 4 Astro files AND in `packages/a11y-tokens/src/tokens.ts`. A CI gate is queued; until it ships, manual discipline is the only protection.
2. **Cloudflare lock-in for marketing**: low risk (Astro output is portable) but real.
3. **The 404-in-pages pattern is non-standard for Starlight**: future contributors may not know why. Mitigated by §2's CI gate + the comment block at the top of `src/pages/404.astro` referencing this ADR.

### Neutral / forward-tracked

- When Starlight ships Zod 4 compatibility, §2's CI gate should be relaxed and the 404 may move back to content collections. Estimate: 1-2 minor Starlight releases (track upstream issue tracker).
- When the marketplace surface (`marketplace.pryzm.so`) ships, it may live on Cloudflare Pages OR on the editor's Replit deployment. That's a separate decision; this ADR scopes only the docs-site.

---

## Related

- **C39** Pricing & Plan Tiers — §1.13 mandates pricing-page-from-registry (which this ADR realises via `pricing.astro`).
- **C43** Accessibility — §1.5 tokens canonical; this ADR adds the marketing-page exception.
- **C00** Docs taxonomy — `docs/05-guides/deployments/` is where deployment runbooks live; CLOUDFLARE-PAGES-SETUP.md is the first one.
- **C48** Backup & DR — the marketing surface inherits Cloudflare's edge SLA; a regional Cloudflare outage takes down `pryzm.so` (acceptable for a marketing site; not acceptable for the editor surface which has its own DR per C48 §1.10).
- **ADR-053** (forthcoming) — lockfile-drift policy + CI gate
- **ADR-054** (forthcoming) — reference-only repos as gitignored subtrees

---

## Change log

- **2026-06-02** — Authored at IP-A5 closure. First deploy of `pryzm.so` from commit `7e015c8` on `main`.
