# PHASE 3C — S62 Closure Audit (2026-04-28)

> Sprint S62 — Plugin SDK 1.0 (manifest schema lock + host proxies +
> iframe sandbox + `pryzm dev` CLI + Ed25519 signing)
> Audit reference for the PROCESS-TRACKER.md row flip from `[~]` → `[✓]`.
> Authority: phase-doc-1 §2 + phase-doc-2 §S62 + ADR-0038.

## §1 Sprint goal vs reality

**Spec goal** (phase-doc-2 §S62): "Plugin SDK 1.0 — descriptor schema
lock, host proxies, iframe sandbox + CSP, `pryzm dev` < 500 ms,
Ed25519 signing infra, npm publish."

**Reality at close**: every D-day deliverable D2-D9 is in repo with
tests; the npm publish itself (D9) is a one-line manual step (gated on
the third-party security audit + 38-plugin parity, both production-
infra dependent — see §3).  The version progression `1.0.0-alpha.1 →
1.0.0-rc.1` per ADR-0038 §Decision D landed in this audit.

## §2 Deliverables landed (D2-D9)

| D | Deliverable | Path | Status |
|---|---|---|---|
| D1 | Locked descriptor schema | `packages/plugin-sdk/src/descriptor.ts` | ✓ landed (S62 D1) |
| D1 | Schema-lock ADR | `docs/02-decisions/adrs/0038-s62-plugin-sdk-descriptor-schema-lock.md` | ✓ landed (S62 D1) |
| **D2** | **Lifecycle hooks** | **`packages/plugin-sdk/src/lifecycle.ts`** | **✓ landed (this audit)** |
| **D3** | **Host proxy contracts (6 files)** | **`packages/plugin-sdk/src/hosts/{index,command-bus,stores,views,selection,ai,format}.ts`** | **✓ landed (this audit)** |
| **D4** | **Sandbox + CSP policy** | **`packages/plugin-sdk/src/sandbox/{index,iframe-sandbox,policy}.ts`** | **✓ landed (this audit)** |
| **D4** | **`pryzm dev` CLI** | **`packages/plugin-sdk/src/dev/cli.ts`** | **✓ landed (this audit, hot-reload < 500 ms budget enforced)** |
| **D5** | **Three working example plugins** | **`packages/plugin-sdk/examples/{hello-plugin,format-plugin,ai-workflow-plugin}/`** | **✓ landed (this audit)** |
| **D6** | **README + getting-started** | **`packages/plugin-sdk/README.md` + `packages/plugin-sdk/docs/getting-started.md`** | **✓ landed (this audit)** |
| **D7** | **Sandbox escape-vector audit suite** | **`packages/plugin-sdk/src/sandbox/escape-tests.ts` + `__tests__/escape-tests.test.ts`** | **✓ landed (this audit) — 14 vectors across 4 categories all pass** |
| **D8** | **Ed25519 signing + revocation list** | **`packages/plugin-sdk/src/signing.ts` + `packages/plugin-sdk/src/canonical-json.ts`** | **✓ landed (this audit)** |
| **D9** | **Version bump to `1.0.0-rc.1` + drop `private:true` + add `bin: pryzm`** | **`packages/plugin-sdk/package.json`** | **✓ landed (this audit)** |

## §3 Deliverables explicitly DEFERRED (gate-pending)

### §3.1 npm publish itself (D9 final step) — DEFERRED until K3-C gate

ADR-0038 §Decision D: "version progression `1.0.0-alpha.1` → `1.0.0`
ONLY at D9 after the K3-C kill-switch gates close (third-party sandbox
audit + Ed25519 signing infra + 38-plugin parity)."

**This sprint**: bumped to `1.0.0-rc.1` (npm `next` tag).  The
`1.0.0` flip + `latest` tag publish is gated on:

1. Third-party sandbox security audit (production-tracked, external).
2. 38-plugin parity bench (per `packages/plugin-sdk/docs/internal-plugin-inventory.md` —
   28 built-in + 5 already-descriptor + 5 needs-manifest = 38; the
   parity bench runs each through the new SDK contract and asserts
   100 % coverage).
3. K3-C OTel sink for kill-switch metrics in production.

Mitigation: the `rc.1` package is fully runnable; downstream consumers
(the editor's `apps/editor/src/plugin-runtime/`, the marketplace skeleton
landing in S64) consume `@pryzm/plugin-sdk@workspace:*` regardless of
the dist-tag, so the publish blocker does not block downstream sprints.

### §3.2 Editor-side runtime integration — DEFERRED to S62 follow-up

The `apps/editor/src/plugin-runtime/` host implementation that consumes
the SDK's host-proxy contracts is in flight separately (it lives in
the editor app, not the SDK package).  The SDK's contracts are
sufficient for the marketplace API (S64) which only needs the schema +
signing surface, so this deferral does not block S64 entry.

## §4 Tests + verification

```
packages/plugin-sdk/__tests__/descriptor.test.ts          (D1)   44/44 cases green (regression check)
packages/plugin-sdk/__tests__/lifecycle.test.ts           NEW     5/5  cases green (hook timeout, definePlugin identity, ctx shape)
packages/plugin-sdk/__tests__/hosts.test.ts               NEW    16/16 cases green (6 proxies x permission-gating + subscribe semantics)
packages/plugin-sdk/__tests__/sandbox.test.ts             NEW    26/26 cases green (CSP construction, head-tag order, srcdoc inlining, wire-direction validators)
packages/plugin-sdk/__tests__/escape-tests.test.ts        NEW    17/17 cases green (14 ESCAPE_VECTORS + schema-level reject for network:fetch+empty-allowedOrigins)
packages/plugin-sdk/__tests__/signing.test.ts             NEW    21/21 cases green (canonical-JSON RFC 8785 simplified, Ed25519 round-trip, makePluginSignature/verifyPluginSignature, RevocationList CRL parsing + verification integration)
                                                                  ────────
                                                                  129/129 cases green
```

App boots green via `Start application` workflow; the engine-router
and main.ts callsite rewire from S61 stay green throughout.

## §5 PROCESS-TRACKER row update

S62 row flips from `[~]` → `[✓]`.  The closure annotation cross-references
this audit and §3 deferred items.

## §6 Cross-references

- `docs/02-decisions/adrs/0038-s62-plugin-sdk-descriptor-schema-lock.md` — schema lock ADR (5 decisions A-E).
- `docs/00_NEW_ARCHITECTURE/phases/PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md` §2 (8-page spec).
- `docs/00_NEW_ARCHITECTURE/phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md` §S62 (3-line phase-doc-2 entry).
- `packages/plugin-sdk/docs/internal-plugin-inventory.md` — 38-plugin parity bench source list.
- `packages/plugin-sdk/README.md` — public docs.
- `packages/plugin-sdk/docs/getting-started.md` — author's quick-start.
- Subsequent: S63 docs portal + public-API + tutorials; S64 marketplace skeleton.
