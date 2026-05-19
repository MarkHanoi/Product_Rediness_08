# ADR-009 — Plugin Sandbox Model

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `05-IMPLEMENTATION-PLAN.md §17` row ADR-009; `CRITICAL-REVIEW-2026-04-27.md` line 175 |
| Required by | Sprint S01 (Phase 1A — plugin host scaffold) |
| Owner | Architecture lead |
| Implementation | `packages/plugin-host/`, `packages/plugin-sdk/`, `packages/plugin-schema/` |
| Spec dependency | `SPEC-09-PLUGIN-SDK.md` §3, §4 |

---

## Context

D4 (third-party plugin marketplace) is one of PRYZM 2's headline differentiators. Plugins are untrusted code authored outside our review cycle; they manipulate the L1 stores via the SDK, render UI panels, and may register tools that handle pointer input.

`CRITICAL-REVIEW-2026-04-27.md` flags ADR-009 as the **gate on the entire L6 layer**: without a sandbox decision, the SDK shape, the manifest schema, and the host API cannot be finalised.

`05-IMPLEMENTATION-PLAN.md §17` proposed "iframe with postMessage RPC." `10-MASTER-IMPLEMENTATION-PLAN-36M.md` row ADR-009 amended this to "Web Worker isolation + postMessage bridge + CSP." This ADR ratifies the amended position. The amendment is justified because Web Workers offer a strictly tighter capability surface than iframes (no DOM at all, structured-clone-only IPC, resource limits) while keeping the postMessage RPC pattern intact.

---

## Decision

**Web Worker isolation + capability-restricted SDK + postMessage RPC + CSP. First-party fast-path runs on the main thread under the same SDK shape.**

### Sandbox model
- Each third-party plugin runs in its own Web Worker (`new Worker(pluginUrl, { type: 'module' })`).
- The worker has **no** access to `document`, `window`, `navigator.clipboard`, `localStorage`, `IndexedDB`, the Y.Doc, the THREE renderer, or any GPU surface. Confirmed by:
  - The Worker global is the standard `DedicatedWorkerGlobalScope` (not `ServiceWorkerGlobalScope`, not nested workers in v1).
  - A static-analysis check (`tools/lint-plugin-bundle.ts`) on the published bundle rejects any reference to forbidden globals before publication.
- Communication is via `postMessage` with **structured clone only** (no `Transferable` for v1; reconsidered in v2 if performance forces it).
- The host runs `packages/plugin-host/` on the main thread; it owns the routing of plugin↔core messages.

### Capability-restricted SDK
- The SDK exported into the worker (`packages/plugin-sdk/`) implements only what the manifest's `permissions` field declared and the user consented to.
- Capabilities are checked **at the host**, not at the worker (defense in depth: a tampered SDK in a malicious worker still cannot escape).
- `permissions.network` is the most sensitive: when set, `fetch` proxies through the host's allow-list (the manifest declares hostnames; the user consents at install).

### Resource limits
- Heap: 256 MiB per plugin worker (`structuredClone` budget enforced by the host on inbound messages; host throttles producers when budget exceeded).
- CPU: per-frame budget of 4 ms; the host's RPC layer prioritises in-frame interactivity over background plugin chatter.
- Network (when permitted): 50 req/min/plugin/actor; 10 MiB max per response.
- Crash isolation: a worker crash terminates only that worker; the host re-launches with backoff (3 attempts, then disabled until user re-enables).

### CSP (Content Security Policy)
- The editor ships with a strict CSP:
  - `script-src 'self' 'wasm-unsafe-eval'`
  - `worker-src 'self' blob:`
  - `connect-src 'self' wss://sync.pryzm.com https://r2.pryzm.com <plugin-allow-listed-hosts>`
  - `frame-src 'none'`
  - `object-src 'none'`
- Plugin bundles are loaded via `blob:` URLs after fetch + integrity-check; never via `<script src=>` injection.
- Plugin manifest signature (per SPEC-09 §6) is verified before instantiation; mismatch = refuse.

### First-party fast-path tier
- Plugins under `@pryzm/*` namespace + signed with the PRYZM publishing key may opt into `trust_tier: "first-party"` in the manifest.
- Fast-path plugins load on the **main thread** with the same SDK surface, bypassing the postMessage round-trip.
- Code review required before merging. Throughput SLO: < 0.5 ms per element commit at LOD 0 (per SPEC-09 §4.3).
- Third-party plugins cannot opt into fast-path under any condition.

### RPC shape (sketch)
```ts
// Host → worker: capability invocation
{ id, kind: 'invoke', method: 'kernel.bake', args: { ... } }
// Worker → host: register extension point
{ id, kind: 'register', point: 'tool', spec: { ... } }
// Worker → host: emit command
{ id, kind: 'command', verb: 'wall.update.v1', payload: { ... } }
// Host → worker: subscribed event
{ id, kind: 'event', topic: 'selection.changed', payload: { ... } }
```

All messages are JSON-serialisable + structured-cloneable. A counter-tracked correlation id supports request/response and stream patterns.

---

## Consequences

**Positive:**
- Strong isolation (no DOM, no GPU, no shared memory by default).
- Crash isolation: a misbehaving plugin cannot kill the editor.
- Capability surface is explicit and user-consented.
- CSP closes off injection paths even for compromised plugin bundles.
- The fast-path tier preserves performance for our own first-party committers without diluting the third-party security model.

**Negative:**
- postMessage round-trip latency is real (tens of microseconds typical; sub-millisecond p99 for small payloads). For high-frequency draws, third-party plugins must batch — documented in the SDK guidance.
- Web Workers cannot share GPU contexts; plugins that need rendering must request the host to render proxy primitives on their behalf (slower).
- Heap limits enforced approximately (no native isolate quota in browsers); a plugin can lie about its allocation. We rely on detected pathology + auto-disable rather than hard quotas.

**Mitigation:**
- The 5-day spike in S01 (per `10-MASTER-IMPLEMENTATION-PLAN-36M.md` line 138) measures actual postMessage cost on the target plugin shapes; results documented as a 1-page report linked from this ADR.
- Pen test in S68 (per risk R-07).

---

## Alternatives considered

### Iframe sandbox
- Rejected: still ships a DOM into the iframe (attack surface); communication has the same postMessage cost; CPU isolation worse than a Worker.

### V8 isolate / Realm sandbox
- Rejected: not browser-portable in 2026; would require WebAssembly polyfills that erode the security claim.

### Process / VM sandbox
- Rejected: not viable in browsers; only relevant for self-host server-side plugins, which are out of v1 scope.

### No sandbox (signed plugins only)
- Rejected: the marketplace promise (D4) is third-party authoring; manual signing is not a substitute for runtime isolation.

### Service Worker
- Rejected: lifecycle (eviction, scope) is wrong for a per-tab plugin runtime.

---

## Phase rollout
- S01 — sandbox spike (5 days); 1-page report linked from this ADR.
- S03 — `packages/plugin-host/` and `packages/plugin-sdk/` scaffolded.
- S07 — first internal plugin (`plugins/wall/`) loads in fast-path.
- S22 (M12 alpha) — first sandboxed third-party-style plugin tested end-to-end (an internal shim).
- S43 — manifest signature verification live; consent dialog ships.
- S48 (M24 beta) — heap/CPU enforcement + crash backoff in place.
- S62 — pre-pen-test hardening pass.
- S68 — third-party pen test; findings remediated.
- S72 (M36 GA) — public SDK 1.0; marketplace open per ADR-018 cut-list outcome.
