# ADR-0039 — S63 Public API OpenAPI Schema + Plugin SDK Docs Site Foundation

> Status: Accepted — sprint-scoped (S63, 2026-04-28)
> Context: Phase 3C, Sprint S63 D1. Two phase docs both define S63:
> `phases/PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md` §3 calls
> S63 the "Plugin SDK Docs Site" sprint and prescribes Astro Starlight at
> `docs.pryzm.com/plugin-sdk/`; `phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md`
> §S63 calls it "Public API Draft Published + OpenAPI Schema" and prescribes
> the OpenAPI 3.1 YAML for `.pryzm` import/export per SPEC-26 §8. The two
> deliverables are complementary, not conflicting — phase-doc-1 §3 line 522
> explicitly references `api/openapi-reference.md` as a docs-site page that
> consumes the OpenAPI YAML produced by phase-doc-2. This ADR records the
> reconciliation made at S63 D1 so D2-D10 can implement against a single
> answer. Spec authority order: SPEC > ADR > MASTER PLAN > CRITICAL-REVIEW
> > 05-IMPL > phase docs (per
> `phases/PHASES-AMENDMENT-2026-04-27-ROBUSTNESS.md` §0). SPEC-26 §8
> constrains the public REST surface but does not constrain the docs-site
> toolchain — phase docs are the highest authority on the latter.

## Context

Two phase docs define S63 with different scopes:

1. **phase-doc-1 §3 (Plugin SDK Docs Site)** — Astro Starlight site at
   `docs.pryzm.com` with twelve sidebar entries across three sections
   (Plugin SDK / REST API / Headless), thirty first-party plugins
   documented as examples by D9, and the Wall Counter tutorial walkable
   end-to-end.
2. **phase-doc-2 §S63 (Public API Draft + OpenAPI Schema)** — OpenAPI 3.1
   YAML at `packages/api-spec/openapi.yaml`, OAuth2 PKCE scaffolding,
   rate-limit policy, version pinned to `1.0.0-draft`.

The two are not in conflict. phase-doc-1 §3 line 522 references
`api/openapi-reference.md` as a docs-site page that renders the OpenAPI
YAML produced by phase-doc-2. The docs site CONSUMES the OpenAPI schema.
Both must land at S63 D1 for D2-D10 to layer on top.

A third constraint: the existing `docs/` tree at the repo root contains
thousands of internal architecture and process documents
(`docs/03_PRYZM3/`, `docs/architecture/adr/` — this very ADR
lives there). Astro Starlight performs a content-collection scan over
its configured root; pointing it at `docs/` would scan thousands of
unrelated markdown files and break the build. The docs site must live
in a path Astro can scan in isolation.

A fourth constraint: SPEC-26 §8 lists five public surfaces for the
`.pryzm` format — two REST endpoints, two CLI invocations
(`pnpm headless ...`), and one plugin-SDK host method
(`host.exportProjectAsPryzm`). Only the REST endpoints belong in an
OpenAPI YAML. The CLI and plugin-SDK surfaces are documented as prose.

## Decisions

### A — S63 has two complementary deliverable streams; both land at D1

`packages/api-spec/` (OpenAPI schema) and `apps/docs-site/` (Astro
Starlight scaffold) are both created at S63 D1. The two interface only
through the docs-site page `api/openapi.md`, which at D1 is a stub
explaining "rendered from `@pryzm/api-spec` at D7" and at D7 becomes the
auto-generated reference (per phase-doc-2 D7 "docs scaffolding at
`docs.pryzm.com/api/`").

### B — OpenAPI source-of-truth is a single hand-authored YAML

`packages/api-spec/openapi.yaml` is hand-authored at D1 from the literal
spec excerpt at phase-doc-2 §S63 lines 290-340. There is no codegen,
no fragment-merging, no auto-rewriting. The YAML is the canonical
artifact; tests assert it parses, validates against an OpenAPI 3.1
invariant checker, and matches a byte-stable SHA-256 (so accidental
auto-formatter rewrites are caught at CI time).

Client SDK codegen (TypeScript / Python clients) is OUT OF SCOPE for
S63 — it is S65 work per phase-doc-2 §S65. The D7 "docs scaffolding"
deliverable consumes the YAML for reference rendering only, not for
code generation.

### C — Docs site lives at `apps/docs-site/`, not at `docs/`

Reason: `docs/` already contains thousands of internal markdown files
across `docs/03_PRYZM3/`, `docs/architecture/adr/`, and a
dozen other subtrees. Astro Starlight performs a content-collection
scan over its configured `src/content/docs/` root; a scan over the
existing `docs/` tree would (a) attempt to render thousands of internal
files as public docs, (b) take many minutes per build, and (c) break
on the many internal files that do not have Starlight-compatible
frontmatter.

The docs site is therefore a sibling workspace member at
`apps/docs-site/` with its own isolated `src/content/docs/` tree.
The existing `docs/` tree stays unchanged; ADRs continue to live at
`docs/architecture/adr/`.

### D — OpenAPI version pin = `'1.0.0-draft'` until S65 GA

Per phase-doc-2 line 298 literally: `version: 1.0.0-draft`. The
version stays at `'1.0.0-draft'` for the duration of S63-S64; flips
to `'1.0.0'` only at S65 Public API GA when the OAuth2 PKCE flow is
proven against a real auth server, the rate-limit policy is ratified,
and the SPEC-26 §8 surfaces are demoed end-to-end.

This mirrors the staged-version pattern landed in ADR-0038 §Decision D
(plugin-SDK pinned to `1.0.0-alpha.1` until S62 D9 K3-C gate closes).

### E — SPEC-26 §8 REST surface is the canonical OpenAPI scope

The OpenAPI YAML at D1 contains exactly the two REST endpoints from
SPEC-26 §8:

- `GET /projects/{projectId}/export.pryzm` — scope `project:read`.
- `POST /projects/import` — scope `project:write`.

(Path prefix `/api/v1/` from SPEC-26 §8 line 4 is folded into the
OpenAPI `servers[0].url = https://api.pryzm.com/v1`, so the operation
paths in the YAML are stripped to `/projects/...`.)

The other §8 surfaces are NOT REST and stay OUT OF the OpenAPI YAML:

- `pnpm headless open file.pryzm` and `pnpm headless export-ifc ...` —
  documented as prose at `apps/docs-site/headless/getting-started.md`.
- Plugin SDK `host.exportProjectAsPryzm()` (capability `project:export`) —
  documented as prose at `apps/docs-site/plugin-sdk/host-api.md`.

The third OAuth scope `ai:invoke` (per phase-doc-2 line 339) is declared
in `components.securitySchemes` so D2-D5 (OAuth2 PKCE scaffolding +
RBAC mapping) can reference it without re-touching the schema, even
though no §8 endpoint uses it at D1.

### F — Astro + Starlight installed at D1 as `apps/docs-site/` deps

Reason: the `astro.config.mjs` literal copy from phase-doc-1 §3 lines
527-561 imports from `astro/config` and `@astrojs/starlight` — without
the deps installed, the file does not type-check and nobody at D2 can
edit it safely. Install the deps now.

The actual `astro build` step is wired (script in `package.json`) but
NOT executed in CI at D1. Reason: the docs site has no consumer until
D7-D9 hosting work; running `astro build` on every CI run would burn
~30 seconds per build for no signal. A one-shot manual `astro build`
is run at D1 acceptance to confirm the scaffold is structurally valid;
the build ID is recorded in `apps/docs-site/INVENTORY.md`. From D7
onward (when hosting goes live) the build is wired into CI.

## Consequences

- D2-D10 of S63 implement against a single shared scope: the OpenAPI
  YAML at `packages/api-spec/openapi.yaml` and the docs-site scaffold
  at `apps/docs-site/`. No further reconciliation between the two
  phase docs is needed.
- The OpenAPI version stays at `'1.0.0-draft'` through S64. Any version
  bump requires a new ADR superseding §D of this one.
- The `docs/` tree at the repo root is untouched. ADRs continue to live
  at `docs/architecture/adr/`.
- `apps/docs-site/` adds Astro + Starlight to the workspace
  `pnpm-lock.yaml`. The transitive cost is one-time and isolated to
  the docs-site workspace member; the editor + headless + sync-server
  apps do not pick up these deps.
- The OpenAPI YAML's byte-stable SHA-256 test means contributors who
  re-format the YAML with an auto-formatter will see a CI failure. This
  is intentional — the YAML is the canonical contract and changes go
  through review, not auto-format.

## Cross-references

- `docs/03_PRYZM3/reference/phases/PHASE-3/3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md`
  §3 (Plugin SDK Docs Site, D1-D10).
- `docs/03_PRYZM3/reference/phases/PHASE-3/3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md`
  §S63 (Public API Draft Published + OpenAPI Schema, D1-D10).
- `docs/03_PRYZM3/reference/specs/SPEC-26-PRYZM-FILE-FORMAT.md` §8 (Public
  API surface — five canonical input/output points for `.pryzm`).
- ADR-0038 — S62 Plugin SDK descriptor schema lock; this ADR mirrors
  ADR-0038 §Decision D (staged version pin pattern).
- `apps/docs-site/INVENTORY.md` — runtime inventory of which docs-site
  pages are scaffolded vs content-pending.
