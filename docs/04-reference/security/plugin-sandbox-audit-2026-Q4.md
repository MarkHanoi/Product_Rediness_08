# Plugin Sandbox Audit — 2026-Q4 (S68 D4)

**Sprint**: PRYZM 2 Phase 3D · S68 D4
**Spec ref**: `docs/03-execution/plans/legacy/phases/PHASE-3/3D-Q4-M34-M36-HARDENING-GA.md` §S68 D4 — "sandbox audit (independent confirmation no escapes)"
**Exit-criteria target**: "Plugin sandbox audit (independent confirmation no escapes)" (S68 exit-criteria table row 3).
**Phase 3C carry-forward**: `[strategic ADR-038]` §Decision B + `phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md` §S62 D4/D7.

---

## §1 What was audited

| Surface                                | Source path                                                          | Audited?     |
| -------------------------------------- | -------------------------------------------------------------------- | ------------ |
| CSP policy generator                   | `packages/plugin-sdk/src/sandbox/policy.ts`                          | Yes          |
| Iframe runtime contract                | `packages/plugin-sdk/src/sandbox/iframe-sandbox.ts`                  | Yes          |
| postMessage envelope shape             | `packages/plugin-sdk/src/sandbox/iframe-sandbox.ts` (`SandboxMessage`) | Yes        |
| Escape-vector regression suite         | `packages/plugin-sdk/src/sandbox/escape-tests.ts` + `__tests__/escape-tests.test.ts` | Yes |
| Host-side runtime (handshake + bridge) | `apps/editor/src/plugin-runtime/` (consumer)                         | Out of scope (no host-runtime edits in this sprint) |
| Manifest descriptor + permissions      | `packages/plugin-sdk/src/descriptor.ts`                              | Spot-checked |

This audit is the **first-party reconfirmation** of the S62 D7 sandbox audit gate. The **independent third-party audit** required by the S68 D4 exit criterion is scheduled separately (founder-coordinated, external firm, runs in parallel with S68 D1–D2 pen test) and its findings will land as §4 of this document when received.

---

## §2 Sandbox model — confirmed correct

The sandbox model is `<iframe sandbox="allow-scripts">` (no `allow-same-origin`). Concretely from `packages/plugin-sdk/src/sandbox/policy.ts`:

```ts
export const SANDBOX_TOKENS = ['allow-scripts'] as const;
```

Tokens explicitly **not** present (and the documented reasons):

- `allow-same-origin` — would defeat cross-origin isolation.
- `allow-top-navigation` — a malicious plugin must not be able to yank the host out from under the user.
- `allow-popups-to-escape-sandbox` — plugin popups stay sandboxed.
- `allow-modals` — plugins are panels, not dialogs.
- `allow-storage-access-by-user-activation` — no Storage Access API.

The combination of `allow-scripts` (without `allow-same-origin`) gives the plugin iframe an **opaque cross-origin** treatment by the browser. Even if a plugin's bundle contains a script-injection bug, the resulting code cannot read the host's cookies, the host's localStorage, the host's DOM, or any other origin's resources. The iframe is a kill-zone by design.

---

## §3 CSP — confirmed correct

The CSP generated per-plugin by `buildPluginCSP(manifest)` is reproduced and justified in `docs/04-reference/security/csp-audit-2026-Q4.md` §3.1. Five points worth restating here:

1. **`default-src 'none'`** — strict deny by default; every directive explicitly opts in.
2. **`connect-src` is `'none'` when `network:fetch` permission is absent** — the network reach of a plugin is gated by an explicit manifest permission, not by host policy.
3. **`connect-src` lists only manifest-declared `allowedOrigins`** — wildcards (`*`) are not allowed (manifest schema rejects them per ADR-0038 §Decision E).
4. **`frame-ancestors 'self'`** — pinned to the host's origin so a third-party page cannot iframe the plugin iframe and trick the user.
5. **`base-uri 'self'`, `form-action 'none'`, `object-src 'none'`** — close the three classic CSP-bypass exits.

---

## §4 Escape vectors — regression suite confirmed

The S62 D7 escape-vector suite at `packages/plugin-sdk/src/sandbox/escape-tests.ts` enumerates known plugin-sandbox attack patterns by category (`csp-bypass`, `wire-spoof`, `origin-spoof`, `permission-bypass`, `sandbox-token-leak`). Each vector has an `assertReject(env)` that the runtime test suite at `packages/plugin-sdk/__tests__/escape-tests.test.ts` walks. A passing run is a **necessary** (not sufficient) condition for the K3-C gate.

### 4.1 Test suite status (2026-04-28)

The escape-tests suite is part of the `plugin-sdk` package's standard test surface and is gated by the package's existing CI workflow. (No dedicated workflow row in this repo's `.replit` because the package's full vitest suite covers it.)

### 4.2 Vector categories audited

| Category               | Coverage in `ESCAPE_VECTORS`                                          |
| ---------------------- | --------------------------------------------------------------------- |
| `csp-bypass`           | `<base>` rewrite, inline-script smuggling via `srcdoc`, `data:` URI script |
| `wire-spoof`           | malformed envelope kinds, missing `requestId`, oversized payloads      |
| `origin-spoof`         | postMessage from wrong window, `event.origin` mismatch                 |
| `permission-bypass`    | `network:fetch` exfil without permission, `storage:write` without permission |
| `sandbox-token-leak`   | host accidentally including `allow-same-origin`                        |

### 4.3 Independent third-party audit (deferred; tracked external)

The independent confirmation required by the S68 D4 exit criterion is **out of scope for this in-repo audit**: it is a contracted external firm engagement, founder-coordinated, runs in parallel with S68 D1–D2 pen test. Findings, when delivered, will be appended here as §4.4 along with regression tests added to `escape-tests.ts`.

---

## §5 Host-side runtime — known dependency, not re-audited

The host-side runtime (handshake, host-call bridge, ULID request correlation, `HOOK_TIMEOUT_MS` watchdog) lives in `apps/editor/src/plugin-runtime/` and consumes the SDK contracts re-audited above. **This audit did not touch `apps/editor/src/`** — code-stability invariant from S67 holds.

The host runtime's responsibilities (per the contract documented in `iframe-sandbox.ts`):

1. Mount plugin into `<iframe sandbox="allow-scripts">` with `srcdoc` from manifest.
2. Handshake before "ready": host → `pryzm/handshake` → plugin → `pryzm/handshake-ack` → host → `pryzm/activate`.
3. Bridge host-proxy method calls; **permission checks happen HOST-SIDE before the request hits the iframe** — a request that exceeds the manifest's permissions never crosses the wire.
4. Time out unresponsive hooks per `HOOK_TIMEOUT_MS` and unmount the iframe — that is the K3-C kill-switch path per phase doc §S62 D7.

If the third-party audit (§4.3) finds a host-runtime escape, the fix lands in `apps/editor/src/plugin-runtime/` at S68 D8 remediation and the regression test goes into the SDK's escape-test suite per the §4 add-vector workflow documented in `escape-tests.ts` lines 17–28.

---

## §6 What this audit does NOT claim

- It is **not** the independent third-party audit required by the S68 D4 exit criterion. That is contracted separately and tracked outside this repo. Until those findings land as §4.4, the K3-C gate is **provisionally held by the regression suite + this self-audit only**.
- It does **not** verify the host-runtime in `apps/editor/src/plugin-runtime/` against the SDK contract — that consumer is unmodified in this sprint and continues to rely on the existing test surface.
- It does **not** address marketplace-side review of plugin bundles for malicious patterns — that is a separate process (manual review + signing + revocation list per `packages/plugin-sdk/src/signing.ts`).
- It does **not** address browser-bug-driven escapes (e.g. a future Chromium bug that breaks `sandbox="allow-scripts"` opacity) — that risk is handled by the kill-switch path: the marketplace can revoke a plugin signature and the host runtime refuses to load any plugin whose signature is revoked.

---

**Authored by**: sprint-S68 (2026-04-28)
**Companion docs**: `docs/04-reference/security/csp-audit-2026-Q4.md`, `docs/04-reference/security/scans-2026-Q4-baseline.md`.
