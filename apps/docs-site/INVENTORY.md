# `apps/docs-site/` — S63 D1 Scaffold Inventory

**Created:** 2026-04-28 (S63 D1)
**Authority:** ADR-0039 §A (S63 D1 reconciliation — docs site at `apps/docs-site/`)
**Spec:** `phases/PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md` §3 lines 491-568

This file tracks what was scaffolded at S63 D1 vs what remains content-pending
through D2-D9.

---

## Toolchain

| Component | Version | Status | Source |
|---|---|---|---|
| `astro` | `^5.0.0` | scaffolded (D1) | phase-doc-1 §3 line 525 |
| `@astrojs/starlight` | `^0.30.0` | scaffolded (D1) | phase-doc-1 §3 line 525 |
| `astro.config.mjs` | literal copy of phase-doc-1 §3 lines 527-561 | scaffolded (D1) | spec |

The Astro build is wired (`pnpm --filter @pryzm/docs-site build`) but is NOT
executed in CI at D1 per ADR-0039 §F. From D7 onward (when hosting goes live)
the build is wired into CI.

---

## Sidebar Pages — Plugin SDK section (7 pages)

| Sidebar entry | File path | Status | D-day owner |
|---|---|---|---|
| Getting Started | `src/content/docs/plugin-sdk/getting-started.md` | scaffolded | D2-D5 (incl. Wall Counter tutorial @ D5) |
| Manifest Reference | `src/content/docs/plugin-sdk/manifest.md` | scaffolded | D2 |
| Permissions | `src/content/docs/plugin-sdk/permissions.md` | scaffolded | D2 |
| Sandbox Model | `src/content/docs/plugin-sdk/sandbox.md` | scaffolded | D2 |
| Host API | `src/content/docs/plugin-sdk/host-api.md` | scaffolded | D2-D3 |
| Examples | `src/content/docs/plugin-sdk/examples.md` | scaffolded | D5-D9 (38 first-party plugins) |
| Distribution | `src/content/docs/plugin-sdk/distribution.md` | scaffolded | D6-D9 |

---

## Sidebar Pages — REST API section (3 pages)

| Sidebar entry | File path | Status | D-day owner |
|---|---|---|---|
| Quickstart | `src/content/docs/api/quickstart.md` | scaffolded | D7 (per phase-doc-2 §S63 D7) |
| Authentication | `src/content/docs/api/auth.md` | scaffolded | D2-D3 (per phase-doc-2 §S63 D2-D3) |
| OpenAPI Reference | `src/content/docs/api/openapi.md` | scaffolded (auto-render at D7) | D7 |

---

## Sidebar Pages — Headless section (3 pages)

| Sidebar entry | File path | Status | D-day owner |
|---|---|---|---|
| Getting Started | `src/content/docs/headless/getting-started.md` | scaffolded | D7 |
| API Reference | `src/content/docs/headless/api.md` | scaffolded | D7 |
| Recipes | `src/content/docs/headless/recipes.md` | scaffolded | D7 |

---

## Landing page

- `src/content/docs/index.md` — scaffolded (D1).

---

## Cross-references to other workspaces

- **`packages/api-spec/`** (S63 D1) — canonical OpenAPI YAML rendered by
  `api/openapi.md` at D7.
- **`packages/plugin-sdk/`** (S62 D1) — locked descriptor schema rendered by
  `plugin-sdk/manifest.md` + `plugin-sdk/permissions.md` at D2.
- **`packages/plugin-sdk/docs/internal-plugin-inventory.md`** (S62 D1) —
  authoritative list of 38 first-party plugins consumed by
  `plugin-sdk/examples.md` at D5-D9.

---

## Out-of-scope for S63 D1

Per ADR-0039 §F, the following are deferred:

- Running `astro check` / `astro build` in CI (D7-D9 hosting work).
- Hosting at `docs.pryzm.com` (D7-D9, separate from this workspace package).
- Auto-rendered OpenAPI reference page (D7, will consume `packages/api-spec/openapi.yaml`).
- Wall Counter tutorial walkthrough (D5).
- AI Plugin tutorial (D5-D6).
- All 38 plugin example writeups (D5-D9).

## D1 acceptance — manual `astro build`

Per ADR-0039 §F, a one-shot `astro build` is run at D1 acceptance and the
result recorded here.

| Field | Value |
|---|---|
| Build run | 2026-04-28 |
| Result | (recorded by T003 verification step) |
