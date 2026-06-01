# SPEC-09 — Plugin SDK & Marketplace (L6, D4)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `CRITICAL-REVIEW-2026-04-27.md §B9` |
| Phases | 1A (host scaffold), 1B (first internal plugin = wall), 1C (per-element committers as plugins), 3C (public SDK 1.0 + marketplace) |

> The plugin host is what makes D4 possible. This spec defines the SDK surface, the manifest, the sandbox, the capability model, and what goes into v1 of the marketplace at M33 (S64–S66).

---

## §1 What's a plugin

A self-contained package that extends PRYZM at one or more **extension points**:

| Extension point | Examples |
|---|---|
| **Element family** | a new structural component (truss, panelised facade, prefab unit). |
| **Element committer** | renderer for a third-party visualisation style. |
| **Importer / Exporter** | DWG, Rhino, USDZ, OBJ. |
| **AI plugin** | per SPEC-07. |
| **View kind** | acoustic-heatmap view, daylight-analysis view. |
| **Tool** | a custom drawing/transform tool. |
| **Panel** | a sidebar/inspector panel. |
| **Schedule field** | a computed parameter for schedules. |
| **AI workflow** | an L7.5 generator/critic/modifier per SPEC-07. |

Internal-first: PRYZM's own element families are plugins from day 1 (`plugins/wall/`, `plugins/door/`, …). This is the only way to validate the SDK surface.

---

## §2 Plugin manifest

```json
{
  "id": "@pryzm/element-truss",
  "kind": "element-family",
  "version": "1.0.0",
  "displayName": "Steel Truss",
  "author": "PRYZM",
  "license": "MIT",
  "min_pryzm_version": "2.0.0",
  "permissions": {
    "read": ["events","projections"],
    "write": ["commands"],
    "ui": ["inspector-panel","tool-palette","element-context-menu"],
    "network": []
  },
  "extension_points": [
    { "kind": "element-family", "elementType": "Truss" },
    { "kind": "tool", "id": "draw-truss" },
    { "kind": "schedule-field", "id": "truss.span" }
  ],
  "entry": {
    "kernel": "dist/kernel.js",
    "committer": "dist/committer.js",
    "ui": "dist/ui.js",
    "tool": "dist/tool.js"
  },
  "assets": {
    "icons": "assets/icons/",
    "templates": "assets/templates/"
  },
  "signature": "sha256-..."   // manifest signature (marketplace)
}
```

Validated against `packages/plugin-schema/manifest.schema.ts` at install and load time.

---

## §3 Sandbox

### §3.1 Web Worker isolation
- Each plugin runs in its own Web Worker.
- Cannot access `document`, `window`, `navigator`, `fetch` directly.
- Communication with the host via structured-cloned messages over `postMessage`.

### §3.2 Capability-restricted SDK
The SDK exposes only what the manifest's `permissions` field declares. A plugin without `permissions.network` cannot call `fetch`. A plugin without `permissions.ui.tool-palette` cannot register a tool.

### §3.3 Resource limits
- Heap limit per plugin worker: 256 MiB (configurable per plugin in marketplace install).
- CPU budget per frame: 4 ms (yields after); long-running operations must be off-frame.
- Network requests (when permitted): 50/min per plugin per actor; bytes per response capped at 10 MiB.

### §3.4 Termination
- Plugin can be paused/resumed by the host.
- Crash isolation: a plugin crash terminates only that plugin's worker; host re-launches with backoff (3 attempts).

---

## §4 Fast-path plugins (closes B9 gap "sandbox limits for fast-path plugins")

### §4.1 What's "fast path"
PRYZM's own element committers run on the render-critical path. A Web Worker round-trip is too slow for those.

### §4.2 Fast-path tier
- Marked in manifest: `"trust_tier": "first-party"`.
- Loaded into the main thread (no Worker isolation).
- Same capability surface as sandboxed plugins, but with no IPC overhead.
- Available **only** to plugins under `@pryzm/*` namespace AND signed with the PRYZM publishing key.
- Third-party plugins MUST run sandboxed.

### §4.3 The contract for first-party
- Code review required before merging any first-party fast-path plugin.
- Throughput SLO: < 0.5 ms per element commit at LOD 0.
- Memory cleanup contract: every element disposal must release GPU buffers within the same frame.

---

## §5 SDK package shape

```
@pryzm/plugin-sdk/
├── kernel/         — pure-data interfaces for the kernel layer
├── committer/      — interfaces + helpers for THREE-side committers (first-party only)
├── ui/             — sidebar/inspector primitives (vanilla TS components)
├── tool/           — tool state-machine + input-binding helpers
├── ai/             — AI plugin SDK (per SPEC-07)
├── importer/       — importer SDK (file → events)
├── exporter/       — exporter SDK (events → file)
├── schedule/       — schedule field/formula helpers
└── view/           — view-kind registration
```

All SDKs are `@types`-included; everything compiles to ESM only; no CommonJS.

---

## §6 Lifecycle

### §6.1 Install
- Marketplace installs to `~/.pryzm/plugins/<id>@<version>/`.
- For self-hosted, installs to a tenant-scoped registry.
- Manifest signature verified against the publisher's public key.
- Capabilities reviewed by the user before activation; consent dialog enumerates permissions.

### §6.2 Activate
- Loaded in worker (or main thread for fast-path).
- Calls `register(host)`; the host calls back per extension point.

### §6.3 Update
- Major version bumps require re-consent.
- Minor/patch updates auto-apply.
- Failed updates roll back to previous version.

### §6.4 Disable / Uninstall
- Disable: plugin stops responding to extension-point calls; data remains.
- Uninstall: plugin removed; events authored by the plugin remain in the event log; affected elements get a "missing plugin" placeholder until re-install or migration.

---

## §7 Marketplace (Phase 3C, S64–S66)

### §7.1 Realistic v1 scope (closes B9 gap "marketplace undersized — 0 launch partners")

**Honest commitment** (downgraded from initial "marketplace ships M33"):
- v1 = a **plugin registry + install UX** + 5–10 first-party plugins + 1–2 launch partners (commitments-in-hand basis).
- The full marketplace ecosystem (rev share, certified-publisher program, billing splits) is **post-GA**.

If 5–10 launch partners are not signed by S60, the v1 marketplace is **scope-cut to first-party-only** and the third-party SDK ships as a public-but-unmarketed surface (developers can build but no in-product discovery yet). This is the cut-list line in ADR-018.

### §7.2 v1 first-party plugins (M36 GA)
- `@pryzm/element-truss`
- `@pryzm/import-rhino`
- `@pryzm/import-dwg` (already in scope as built-in)
- `@pryzm/export-pdf` (already in scope as built-in)
- `@pryzm/ai-floorplan-generator` (per SPEC-07)
- `@pryzm/ai-code-critic`
- `@pryzm/ai-schedule-helper`
- `@pryzm/view-daylight-heatmap`

### §7.3 Submission flow
- Publisher signs in with org account.
- Submits `.pryzm-plugin` artefact + manifest + screenshots + docs link.
- Automated checks: schema validation, signature, license, basic security scan.
- Manual review: capability surface, UX guidelines, performance.
- Outcome: `published` (visible in marketplace) or `requires-changes`.

### §7.4 Distribution
- Hosted at `marketplace.pryzm.com`.
- CDN-cached.
- Signed download URLs.

### §7.5 Revenue model
- Free plugins: free.
- Paid plugins: PRYZM hosts billing (Stripe Connect); 80/20 publisher/PRYZM split.
- Subscription plugins: monthly per seat.
- Out of scope for v1: revenue model lights up at marketplace v2 (post-GA).

---

## §8 Compatibility & version policy

- Plugin manifest declares `min_pryzm_version`.
- Breaking SDK changes are announced 90 days in advance with a migration codemod.
- LTS support: SDK majors supported for 24 months from release.
- Per-plugin compatibility matrix shown on its marketplace page.

---

## §9 OpenTelemetry instrumentation
- `plugin.load` — input `(pluginId, version)`; output `(durationMs, sandboxKind)`.
- `plugin.call` — input `(pluginId, extensionPoint)`; output `(durationMs)`.
- `plugin.crash` — input `(pluginId, extensionPoint, error)`.
- `plugin.permission-denied` — input `(pluginId, capability)`.

---

## §10 Cross-references
- Layer placement: `08-VISION §4` (L6).
- AI plugin specifics: SPEC-07.
- Phase deliverables: `phases/PHASE-1A` (host), `phases/PHASE-1B` (wall as plugin), `phases/PHASE-3-COMPLETION-GA-M25-M36.md` §4 (3C marketplace).
- Cut-list: ADR-018 marketplace-vs-first-party scope cut.
- Differentiator: D4 (`08-VISION §5`).
