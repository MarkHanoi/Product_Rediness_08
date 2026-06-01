# Phase 3C — Plugin SDK 1.0, Marketplace, Public REST/WS, Headless npm
## Q3 of Phase 3 · Months 31–33 · Sprints S61–S66

> **Authority note (added 2026-04-27).** This sub-phase doc is subordinate to the SPEC and ADR series. Conflict precedence: `docs/03_PRYZM3/reference/specs/SPEC-*` → `docs/03_PRYZM3/reference/adrs/ADR-*` (cited as `[strategic ADR-NNN]`) → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → `CRITICAL-REVIEW-2026-04-27.md` → `05-IMPLEMENTATION-PLAN.md` → this phase doc. Sprint-scoped ADRs in `docs/architecture/adr/NNNN-slug.md` are cited as `[ADR NNNN-slug]`.
>
> **Strategic anchor**: `08-VISION.md` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §6 → `phases/PHASE-3-COMPLETION-GA-M25-M36.md` §4 → this file.
>
> **Coalescing-window invariant**: every reference to bake/event coalescing means **250 ms** per `[strategic ADR-010]`.

---

## Executive Summary

**Sub-phase goal**: open every public surface. Plugin SDK 1.0 published. Marketplace live with first-party + third-party plugins. Public REST + WS APIs documented + rate-limited + OAuth2-authenticated. Headless npm publish. AI public API. Workspace Admin AI Spend view. PRYZM 1 sunset migration tool published. By M33 PRYZM 2 is **the platform** open to third parties — every D1–D7 differentiator addressable from outside the editor.

**Why 3C is the hardest deletion phase**: S61 deletes `src/engine/EngineBootstrap.ts` (per SPEC-27 §4.3) and replaces it with `apps/editor/src/main.ts` as the new composition root. This is **the hardest deletion in the 36-month plan**. Every legacy import path must be re-routed; every test must move; every bundle map must update. K3-A applied here: if cleanup overruns, the SDK 1.0 publish (S62) slips by two weeks minimum.

**The four hardest problems in 3C**:

1. **`src/engine/EngineBootstrap.ts` deletion** (S61) — the new composition root is `apps/editor/src/main.ts`; every bootstrap call must be migrated. K3-A applies.
2. **Plugin SDK 1.0 publish** (S62) — the SDK must lock the descriptor schema, the host contract, the lifecycle hooks, and the type signatures *for v1*. A breaking change post-publish costs two minor versions; v2 is post-GA.
3. **Marketplace + signed plugins** (S64) — Ed25519 signing + revocation list + signing key in HSM-equivalent per S62 D8 + S64 D5. Per [strategic ADR-009] the plugin sandbox audit at S62 must pass before marketplace opens.
4. **Public REST + WS API rate-limiting** (S65) — per [strategic ADR-018] quotas, OAuth2 PKCE, abuse-detection. Cost-of-abuse must be < 1% of revenue at expected scale; per K3-D if p95 > 500 ms for reads, halt API publish.

---

## §0 Reading Conventions

**ADR citation format**: `[strategic ADR-NNN]` for strategic series; `[ADR NNNN-slug]` for sprint-scoped.

**Public-surface invariant**: every public surface (REST, WS, headless, AI, marketplace, descriptor schema) ships with versioned semver, published OpenAPI/JSON-schema, and a deprecation policy of "1 year minimum" before removal in a major.

**Headless-Node parity invariant**: per `[strategic ADR-005]` and `[ADR 0017-headless-package-surface]`, every public API path that is reachable from the editor must also be reachable from `@pryzm/headless` running in Node — no DOM, no THREE, no React.

---

## §1 Track Allocation for 3C

### Track A — Composition root deletion, SDK, headless npm, public APIs (Agent A)

| Item | Sprint |
|---|---|
| `src/engine/EngineBootstrap.ts` **deleted** per SPEC-27 §4.3; `apps/editor/src/main.ts` is new composition root | S61 |
| Plugin SDK 1.0 publish (`@pryzm/plugin-sdk@1.0.0`) | S62 |
| Plugin sandbox audit per [strategic ADR-009] (third-party) | S62 |
| Public API draft published; OpenAPI schema for `.pryzm` import/export per SPEC-26 §8 | S63 |
| Public REST `import` / `export.pryzm` endpoints lit per SPEC-26 §11 | S65 |
| AI public API (read-only L7.5 surface) | S65 |
| Headless npm publish (`@pryzm/headless@1.0.0`) | S66 |
| Public WS API (project channels, awareness read-only feed) | S65 |
| Workspace Admin AI Spend view per SPEC-28 §9 | S65 |

### Track B — Marketplace, sunset migration tool, design system completion (Agent B)

| Item | Sprint |
|---|---|
| Marketplace skeleton + plugin discovery API | S64 |
| Ed25519 signing + revocation list + signing key in HSM-equivalent | S64 |
| 30 first-party plugins seeded into marketplace | S64 |
| 5 third-party invitation cohort | S64 |
| `packages/ui/` migration covers all editor panels; `src/styles/panels/` 80% migrated | S64 |
| `src/styles/` deletion completes per `[strategic ADR-026]` + SPEC-27 | S66 |
| Public API beta opens | S66 |
| Enterprise admin UI for plan/role overrides per [strategic ADR-028] Part E | S65 |
| Formula library extraction for plugin SDK exposure (read-only) per [strategic ADR-027] | S65 |
| View+project lifecycle events deleted per [strategic ADR-030] Part D | S65 |
| Documentation site `docs.pryzm.com` consolidation begins | S66 |
| PDF backend large-sheet bench < 8 s green per SPEC-29 §9 | S65 |
| WebGPU compute investigation for post-GA SPEC-30 acceleration | S65 |
| PDF-to-BIM pricing finalised; cost ceilings enforced per [strategic ADR-029] Part C | S65 |

### Joint Deliverables

| Item | Sprint |
|---|---|
| Sprint-scoped `[ADR 0017-headless-package-surface]` (refresh) | S61 D1 |
| Sprint-scoped `[ADR 0021-plugin-descriptor-bootstrap-everything]` (lock) | S62 D1 |
| 3C demo recording (12-min screencast) | S66 D9 |
| `apps/bench/reports/M33-3C.md` | S66 D9 |

---

## §2 Sprint-by-Sprint Detail

---

### S61 — Composition Root Deletion + Sunset Migration Tool Begins
**Weeks 121–122 (Month 31)**

---

#### Context and Why This Matters

S61 is the hardest sprint in the 36-month plan. `src/engine/EngineBootstrap.ts` is the legacy composition root — the file every bootstrap path passes through, the file 200+ tests reach into directly, the file every legacy plugin treats as a service locator. Per SPEC-27 §4.3 it is **deleted** this sprint; `apps/editor/src/main.ts` is the new composition root.

The mitigation strategy is the canary deploy: 5% of beta cohort gets the post-deletion build first; if any stability regression is detected within 48 hours, fix-forward (no rollback path).

The PRYZM 1 sunset migration tool begins this sprint per the master plan: 90-day migration window starts from S61 D5; tool publishes per-project migration; batch tool is post-GA.

---

#### Implementation Detail — New composition root

```typescript
// apps/editor/src/main.ts (the new composition root)

import { createScheduler } from '@pryzm/runtime/scheduler';
import { createCommandBus } from '@pryzm/runtime/command-bus';
import { createPluginHost } from '@pryzm/runtime/plugin-host';
import { createSyncClient } from '@pryzm/sync-client';
import { createAiPlane } from '@pryzm/ai-host';

import './styles.css';

async function main() {
  const scheduler = createScheduler();
  const commandBus = createCommandBus();
  const eventLog = await openEventLog(/* config */);
  const pluginHost = createPluginHost({ scheduler, commandBus, eventLog });

  // Lazy plane bootstraps — none of these load impl bytes at first paint.
  const sync = await createSyncClient({ /* config */ });
  const ai   = await createAiPlane({ /* config */ });

  // Plugin discovery — descriptors only at first paint; impl on activation.
  await pluginHost.discoverDescriptors([
    'pryzm/walls', 'pryzm/slabs', 'pryzm/doors', 'pryzm/windows',
    'pryzm/rooms', 'pryzm/structural', 'pryzm/lighting', 'pryzm/plumbing',
    'pryzm/furniture', 'pryzm/dimensions', 'pryzm/annotations',
    'pryzm/plan-view', 'pryzm/section-view', 'pryzm/sheets', 'pryzm/schedules',
    'pryzm/visibility-intent', 'pryzm/multiplayer',
    'pryzm/ifc-import', 'pryzm/dxf-import', 'pryzm/rhino-import', 'pryzm/bcf',
    'pryzm/ai-floorplan',
  ]);

  pluginHost.start();
  scheduler.start();
}

main().catch((err) => {
  console.error('Bootstrap failed', err);
  document.body.innerHTML = '<pre>PRYZM failed to start. See console.</pre>';
});
```

---

#### Daily Plan

- **D1**: composition-root migration tooling; legacy import-path scan.
- **D2**: rewrite 25% of legacy bootstrap call sites.
- **D3**: rewrite 50% of legacy bootstrap call sites.
- **D4**: rewrite 75% of legacy bootstrap call sites.
- **D5**: **delete `src/engine/EngineBootstrap.ts`**; sunset migration tool published.
- **D6**: full visual regression sweep; e2e suite green.
- **D7**: canary deploy to 5% of beta cohort.
- **D8**: 48-hour canary monitoring + fix-forward on any regression.
- **D9**: full beta rollout.
- **D10**: retro + buffer.

---

#### Exit Criteria for S61

- `src/engine/EngineBootstrap.ts` deleted; `apps/editor/src/main.ts` is the new composition root.
- All e2e tests green post-deletion.
- Canary cohort 48-hour monitoring clean.
- PRYZM 1 sunset migration tool published; 90-day window started.
- Bundle-size verification: net reduction.

---

### S62 — Plugin SDK 1.0 + Plugin Sandbox Audit
**Weeks 123–124 (Month 31–32)**

---

#### Context and Why This Matters

`@pryzm/plugin-sdk@1.0.0` locks the public plugin surface for v1. Per K3-C, if at this sprint the plugin sandbox fails an escape attempt in independent audit, SDK 1.0 publish halts; do not enter S64 marketplace until resolved.

The SDK package is small (~30 files) but the **descriptor schema is permanent** — breaking changes in v1 are a 1-year deprecation cycle minimum.

---

#### Implementation Detail — `@pryzm/plugin-sdk` shape

```text
@pryzm/plugin-sdk/
├── README.md
├── package.json                  // semver 1.0.0; engines.node >=20
├── descriptor.ts                 // PluginDescriptor type + zod schema
├── lifecycle.ts                  // onActivate, onDeactivate, onUpdate
├── hosts/
│   ├── command-bus.ts            // proxy host exposes command-bus.commit
│   ├── stores.ts                 // read-only store accessors
│   ├── views.ts                  // CanvasHost subclass surface
│   ├── selection.ts              // SelectionStore proxy
│   ├── ai.ts                     // AiPlane workflow registration
│   └── format.ts                 // FormatPluginInterface
├── sandbox/
│   ├── iframe-sandbox.ts         // sandboxed iframe wrapper
│   ├── policy.ts                 // CSP + permission policy
│   └── escape-tests/             // automated escape-attempt suite
├── types.ts                      // every public type exported here
└── examples/
    ├── hello-plugin/
    ├── format-plugin/
    └── ai-workflow-plugin/
```

---

#### Implementation Detail — Plugin sandbox

```typescript
// @pryzm/plugin-sdk/sandbox/iframe-sandbox.ts

export class IframeSandbox {
  private iframe: HTMLIFrameElement;

  constructor(opts: SandboxOpts) {
    this.iframe = document.createElement('iframe');
    this.iframe.sandbox.value = 'allow-scripts';   // no allow-same-origin → cross-origin isolated
    this.iframe.src = opts.pluginUrl;
    // CSP: no eval, no inline, no remote network except via host bridge
    document.body.appendChild(this.iframe);

    window.addEventListener('message', this.onMessage);
  }

  // The host bridge: every plugin call into the host crosses postMessage.
  // The host validates capability; rejected calls log to audit_log per S57.
  private onMessage = (ev: MessageEvent) => {
    if (ev.source !== this.iframe.contentWindow) return;
    const call = parsePluginCall(ev.data);
    if (!this.policy.allows(call)) {
      this.iframe.contentWindow!.postMessage({ id: call.id, error: 'denied' }, '*');
      return;
    }
    this.dispatchHostCall(call);
  };
}
```

---

#### Daily Plan

- **D1**: descriptor schema lock; semver 1.0.0 commitment.
- **D2**: SDK package skeleton.
- **D3**: host proxies (command-bus, stores, views, selection, ai, format).
- **D4**: iframe sandbox + CSP policy.
- **D5**: example plugins (hello, format, ai-workflow).
- **D6**: SDK README + getting-started docs.
- **D7**: sandbox audit (third-party); escape-attempt suite green.
- **D8**: signing key in HSM-equivalent; revocation-list infra.
- **D9**: SDK 1.0 npm publish (signed; pre-release tag `next` first if any audit finding open).
- **D10**: buffer.

---

#### Exit Criteria for S62

- `@pryzm/plugin-sdk@1.0.0` published.
- Plugin sandbox audit signed off (no escape).
- 3 example plugins published as references.
- Signing key + revocation list operational.

---

### S63 — Public API Draft Published + OpenAPI Schema
**Weeks 125–126 (Month 32)**

---

#### Context and Why This Matters

The public REST + WS APIs target use-cases like:

- CI integration: validate `.pryzm` against a rules-engine in a build pipeline.
- Document generation: render PDFs via API for an external print queue.
- Headless authoring: generate hundreds of project variants programmatically.
- Awareness mirror: render a "who is in which project" dashboard.

Per SPEC-26 §8, the `.pryzm` import/export is the first endpoint surface to publish OpenAPI schema for, because external CI integrations are the most-requested use-case in beta cohort surveys.

---

#### Implementation Detail — OpenAPI schema for `.pryzm`

```yaml
# packages/api-schema/openapi.yaml

openapi: 3.1.0
info:
  title: PRYZM Public API
  version: 1.0.0-draft
servers:
  - url: https://api.pryzm.com/v1

paths:
  /projects/{projectId}/export.pryzm:
    get:
      summary: Export project as .pryzm v1
      security:
        - oauth2: [project:read]
      responses:
        '200':
          content:
            application/zip: { schema: { type: string, format: binary } }

  /projects/import:
    post:
      summary: Import .pryzm v1 → new project
      security:
        - oauth2: [project:write]
      requestBody:
        content:
          application/zip: { schema: { type: string, format: binary } }
      responses:
        '201':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Project'

components:
  securitySchemes:
    oauth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.pryzm.com/oauth/authorize
          tokenUrl:         https://auth.pryzm.com/oauth/token
          scopes:
            project:read:  Read project state
            project:write: Create/update projects
            ai:invoke:     Invoke AI workflows
```

---

#### Daily Plan

- **D1**: OpenAPI schema draft.
- **D2**: OAuth2 PKCE flow scaffolding.
- **D3**: scope definitions + RBAC mapping.
- **D4**: rate-limit policy draft (per `[strategic ADR-018]`).
- **D5**: API gateway scaffolding.
- **D6**: smoke test against draft endpoints.
- **D7**: docs scaffolding at `docs.pryzm.com/api/`.
- **D8**: lint + perf bench.
- **D9**: demo + draft published for community review.
- **D10**: buffer.

---

#### Exit Criteria for S63

- OpenAPI schema published as draft at `docs.pryzm.com/api/`.
- OAuth2 PKCE scaffolding operational.
- Rate-limit policy ratified.

---

### S64 — Marketplace Skeleton + 30 First-Party Plugins + Design System Migration Continues
**Weeks 127–128 (Month 32)**

---

#### Context and Why This Matters

The marketplace is **the** platform-level visibility surface for third-party plugins. Per [strategic ADR-009] the marketplace ships with: signed plugins (Ed25519), revocation list, per-plugin install scoping (workspace, project, user), versioning + deprecation policy, security sandbox audit references.

30 first-party plugins seed the marketplace — these are the bundled plugins from PRYZM 2 surfaced as discoverable items (walls, slabs, doors, ifc-import, ai-floorplan, etc.) with download analytics.

5 third-party invitation cohort (curated from beta + community) gets early access to the marketplace publish path.

`packages/ui/` migration continues: 80% of `src/styles/panels/` migrated this sprint; full deletion at S66.

---

#### Implementation Detail — Marketplace plugin record

```sql
CREATE TABLE marketplace_plugins (
  plugin_id        TEXT PRIMARY KEY,            -- 'pryzm/walls' or 'thirdparty/structural-rules'
  display_name     TEXT NOT NULL,
  publisher_id     TEXT NOT NULL REFERENCES publishers(id),
  description      TEXT NOT NULL,
  license          TEXT NOT NULL,
  category         TEXT NOT NULL,
  surfaces         TEXT[] NOT NULL,
  homepage_url     TEXT,
  source_url       TEXT,
  is_first_party   BOOLEAN NOT NULL DEFAULT FALSE,
  audit_passed     BOOLEAN NOT NULL DEFAULT FALSE,
  audit_passed_at  TIMESTAMPTZ,
  install_count    BIGINT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE marketplace_plugin_versions (
  plugin_id        TEXT NOT NULL REFERENCES marketplace_plugins(plugin_id),
  version          TEXT NOT NULL,                -- semver
  signature        TEXT NOT NULL,                -- Ed25519 signature
  signed_by_keyid  TEXT NOT NULL,
  bundle_url       TEXT NOT NULL,
  bundle_sha256    TEXT NOT NULL,
  published_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ,                  -- non-null = revoked
  revoke_reason    TEXT,
  PRIMARY KEY (plugin_id, version)
);
```

---

#### Daily Plan

- **D1**: marketplace schema + first-party plugin seeding pipeline.
- **D2**: marketplace UI (browse, search, install).
- **D3**: install / uninstall flows + per-workspace scoping.
- **D4**: 30 first-party plugins seeded.
- **D5**: signing + revocation infra + first signed plugin install.
- **D6**: 5 third-party invitations sent; sandbox-audit fast-track for first 3.
- **D7**: `packages/ui/` migration of 80% of panels.
- **D8**: lint + perf.
- **D9**: demo.
- **D10**: buffer.

---

#### Exit Criteria for S64

- Marketplace browse + install + uninstall + version flows working.
- 30 first-party plugins discoverable.
- 5 third-party publishers active.
- All installs signed; revocation tested on at least one plugin.
- 80% of `src/styles/panels/` migrated.

---

### S65 — Public REST/WS Lit + AI Public API + Workspace Admin AI Spend + PDF Bench + Lifecycle Deletes
**Weeks 129–130 (Month 33)**

---

#### Context and Why This Matters

S65 is the busy sprint of 3C. Per the gap-closure subphase it bundles 8+ work-items, each individually small but collectively the most-touched sprint of Phase 3. The discipline is: each item has a `[ADR ...]` or SPEC trace; nothing lands undocumented.

K3-D applies: if public API p95 > 500 ms for reads at S65 D8, halt API publish; tune until < 200 ms before S66.

---

#### Major work-items

1. **Public REST `import` / `export.pryzm` endpoints lit** per SPEC-26 §11.
2. **Public WS API**: project channel (events) + awareness read-only feed.
3. **AI public API** (read-only L7.5 surface): list workflows, describe workflows, invoke (rate-limited, OAuth2-scoped).
4. **PDF backend large-sheet bench < 8 s green** per SPEC-29 §9.
5. **WebGPU compute investigation** for post-GA SPEC-30 acceleration (research only).
6. **PDF-to-BIM pricing finalised**; cost ceilings enforced per [strategic ADR-029] Part C.
7. **Workspace Admin AI Spend view** per SPEC-28 §9 (per-workspace dashboard surfacing `pryzm.ai.cost.usd` aggregations).
8. **Enterprise admin UI for plan/role overrides** per [strategic ADR-028] Part E.
9. **Formula library extraction** for plugin SDK exposure (read-only) per [strategic ADR-027].
10. **View+project lifecycle events deleted** per [strategic ADR-030] Part D — replaced with descriptor-driven hooks.

---

#### Daily Plan

- **D1**: REST endpoint scaffolding + OAuth2 wiring; lifecycle deletion plan.
- **D2**: REST import/export endpoints lit.
- **D3**: WS project channel + awareness read-only feed.
- **D4**: AI public API; formula library extraction.
- **D5**: Workspace Admin AI Spend view + Enterprise admin UI.
- **D6**: PDF backend large-sheet bench tuning; PDF-to-BIM pricing finalised.
- **D7**: View+project lifecycle events deleted.
- **D8**: load tests; p95 verification (K3-D gate).
- **D9**: WebGPU investigation report.
- **D10**: demo + buffer.

---

#### Exit Criteria for S65

- Public REST endpoints lit; OpenAPI docs match implementation.
- Public WS endpoints lit.
- AI public API lit (read-only invoke).
- Public-API p95 < 200 ms (read), < 500 ms (write); throughput at least 1000 req/min/endpoint.
- AI Spend view live for workspace admins.
- PDF backend large-sheet bench < 8 s.
- View+project lifecycle events deleted; [strategic ADR-030] Part D contract met.

---

### S66 — `src/styles/` Deleted + Public API Beta + Headless npm Publish + Docs Site Consolidation
**Weeks 131–132 (Month 33)**

---

#### Context and Why This Matters

S66 wraps Phase 3C. `src/styles/` is **deleted** per `[strategic ADR-026]` + SPEC-27 — the design system migration completes; every editor panel now consumes `packages/ui/` primitives + tokens.

Public API beta opens to the broader community (not just beta cohort). `@pryzm/headless@1.0.0` ships on npm with the same descriptor-driven plugin discovery as the editor. Documentation site `docs.pryzm.com/{plugin-sdk,api,headless,file-format}` consolidates into a single navigable source-of-truth.

---

#### Daily Plan

- **D1**: final `src/styles/` migration; remaining 20% of panels.
- **D2**: `src/styles/` deletion.
- **D3**: headless npm publish (`@pryzm/headless@1.0.0`).
- **D4**: public API beta opens.
- **D5**: docs site consolidation; navigation rework.
- **D6**: 3C bench suite assembly + bench run.
- **D7**: 12-min 3C demo recording.
- **D8**: bench analysis + perf doc updates.
- **D9**: 3C retro + `apps/bench/reports/M33-3C.md` published.
- **D10**: founder rest day before S67.

---

#### Exit Criteria for S66 (and Sub-phase 3C)

- SDK 1.0 + marketplace + public REST/WS + AI API + headless npm — every public surface live.
- `src/styles/` deleted.
- `apps/bench/reports/M33-3C.md` published.
- All M30 numbers still green (regression bench).
- 30 first-party plugins discoverable; 5 third-party plugins active in marketplace.

---

## §3 Phase 3C Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Touch sprint |
|---|---|---|---|---|---|
| R3C-01 | Composition-root deletion (S61) breaks production | Medium | High | Full visual + e2e regression sweep; canary deploy 5% beta first; fix-forward | S61 |
| R3C-02 | Plugin sandbox escape post-publish | Low | Critical | [strategic ADR-009] + S62 sandbox audit + S68 pen test; bug bounty post-GA | S62, S68 |
| R3C-03 | Public API abuse (excessive rate, scrape) | Medium | Medium | Rate limits + per-key quotas + abuse detection in S65; ban list operational | S65 |
| R3C-04 | Marketplace plugin signing weakness | Low | Critical | Ed25519 + revocation list; signing key in HSM-equivalent | S64 |
| R3C-05 | AI API costs unviable at scale | Medium | Medium | Per-key quotas + tier pricing in S53; usage caps; user-bring-your-own-key for heavy AI | S53, S65 |
| R3C-06 | SDK 1.0 lock-in produces immediate breaking-change request | Medium | Medium | API council review at S62 D2; descriptor schema review by 3 third parties | S62 |
| R3C-07 | Headless npm publish breaks Node 20 LTS | Low | Medium | CI matrix Node 20 + 22; integration fixture green | S66 |
| R3C-08 | `src/styles/` deletion exposes hidden dependency | Medium | Medium | Per-panel migration tests; visual diff < 2 px on critical paths | S66 |
| R3C-09 | Public WS API connection scaling | Medium | High | Rate-limit per IP; sticky-session balancing on Reserved VM | S65 |
| R3C-10 | Workspace Admin AI Spend view exposes raw cost data inadvertently | Low | Low | RBAC tested; admin-only scope; no PII | S65 |

---

## §4 Phase 3C Kill-Switches

- **K3C-A** (= K3-A) — If at end of S54 (M27) AI host has > 5% boot impact, halt 3B (already gated; rechecked at S61 D7 canary).
- **K3C-B** (= K3-C) — If at S62 plugin sandbox fails an escape attempt in audit, halt SDK 1.0 publish; do not enter S64 marketplace until resolved.
- **K3C-C** (= K3-D) — If at S65 public API p95 > 500 ms for reads, halt API publish; tune until < 200 ms.
- **K3C-D** — If at S66 D2 `src/styles/` deletion exposes a regression on critical paths > 2 px visual diff, restore deletion + fix forward in S67.

---

## §5 Gap-Closure Subphase — Phase 3C (binding; consolidated)

| Sprint | Gap-closure deliverable | Closes |
|---|---|---|
| **S61** | `src/engine/EngineBootstrap.ts` **deleted** per SPEC-27 §4.3; `apps/editor/src/main.ts` is the new composition root. The hardest deletion. | SPEC-27 §4.3 |
| **S62** | PDF-to-BIM fixture corpus parity testing; accuracy bar measurement per `[strategic ADR-029]` Part E. WebGPU readiness re-evaluated per `[strategic ADR-025]` Part C. SDK 1.0 publish + sandbox audit. | `[strategic ADR-029]`, `[strategic ADR-025]`, [strategic ADR-009] |
| **S63** | Public API draft published; OpenAPI schema for `.pryzm` import/export per SPEC-26 §8. | SPEC-26 §8 |
| **S64** | `packages/ui/` migration covers all editor panels; `src/styles/panels/` 80% migrated. Marketplace + signing live. | `[strategic ADR-026]`, [strategic ADR-009] |
| **S65** | Public REST `import` / `export.pryzm` endpoints lit per SPEC-26 §11. PDF backend large-sheet bench < 8 s green per SPEC-29 §9. WebGPU compute investigation for post-GA SPEC-30 acceleration. PDF-to-BIM pricing finalised; cost ceilings enforced per `[strategic ADR-029]` Part C. Workspace Admin AI Spend view shipped per SPEC-28 §9. Enterprise admin UI for plan/role overrides per [strategic ADR-028] Part E. Formula library extraction for plugin SDK exposure (read-only) per [strategic ADR-027]. View+project lifecycle events deleted per [strategic ADR-030] Part D. | SPEC-26, SPEC-28, SPEC-29, SPEC-30, `[strategic ADR-026]`, [strategic ADR-027], [strategic ADR-028], `[strategic ADR-029]`, [strategic ADR-030] |
| **S66** | `src/styles/` deletion completes per `[strategic ADR-026]` + SPEC-27. Public API beta opens. Headless npm published. | `[strategic ADR-026]`, SPEC-26 |

---

## §6 What Phase 3C Explicitly Did NOT Do

- Self-host packaging (Phase 3D).
- Browser matrix beyond Chromium (Phase 3D).
- Pen test (Phase 3D).
- WCAG 2.2 AA (Phase 3D).
- Marketing site + GA launch (Phase 3D).
- PDF-to-BIM public preview (S70).
- Multi-region sync replication (cut per `[strategic ADR-018]` T1.7).

---

## §7 Phase 3C → 3D Handoff Checklist

- [ ] All M33 3C criteria signed off.
- [ ] `apps/bench/reports/M33-3C.md` published.
- [ ] One full week of mandatory founder rest.
- [ ] Public API stability monitored for 1 week post-S66.
- [ ] No P0/P1 from public API beta.
- [ ] Marketplace operational with signed third-party plugins.
- [ ] Plugin SDK 1.0 stable; no breaking-change requests outstanding.
- [ ] `phases/PHASE-3D-Q4-M34-M36-HARDENING-GA.md` re-read.

---

*Last updated: 2026-04-27. Owner: Founder + Architecture lead. Conflicts? See Authority note at top. The hardest moment in 3C is S61 D5 (composition-root deletion); the most consequential publish is S62 (SDK 1.0). Both have explicit kill-switches.*
