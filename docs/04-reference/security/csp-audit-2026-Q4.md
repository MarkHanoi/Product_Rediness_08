# CSP Audit — 2026-Q4 (S68 D3)

**Sprint**: PRYZM 2 Phase 3D · S68 D3
**Spec ref**: `docs/03-execution/plans/legacy/phases/PHASE-3/3D-Q4-M34-M36-HARDENING-GA.md` §S68 D3 — "CSP audit + remediation (CSP report at `docs/04-reference/security/csp-audit-2026-Q4.md`)"
**Exit-criteria target**: "CSP gates production traffic" (S68 exit §3).

---

## §1 Surfaces audited

The CSP surface area for PRYZM 2 spans **three independent boundaries**:

| # | Boundary                       | Origin (production)    | CSP source                                    |
| - | ------------------------------ | ---------------------- | --------------------------------------------- |
| 1 | Editor SPA (host document)     | `app.pryzm.com`        | nginx response header (was: missing — fixed in this audit) |
| 2 | Plugin iframes (sandboxed)     | opaque cross-origin    | `<meta http-equiv="Content-Security-Policy">` injected by `packages/plugin-sdk/src/sandbox/policy.ts::buildPluginCSP` |
| 3 | Marketing + docs sites         | `pryzm.com`, `docs.pryzm.com` | (out of scope for S68 — S71 owns) |

This audit covers boundaries 1 and 2. Boundary 3 is tracked under S71 D7 SEO + metadata day.

---

## §2 Boundary 1 — Editor SPA host document

### 2.1 Pre-audit posture (S67 close)

`pryzm-selfhost/nginx/editor.conf` shipped with three security headers but **no CSP**:

```nginx
add_header X-Frame-Options              "SAMEORIGIN" always;
add_header X-Content-Type-Options       "nosniff" always;
add_header Referrer-Policy              "strict-origin-when-cross-origin" always;
```

The editor SPA loaded with **no CSP** in the response. Browsers fell back to the default policy (everything allowed). This is the gap S68 D3 closes.

### 2.2 Post-audit posture (S68 D3)

The editor nginx config now emits:

```
Content-Security-Policy: default-src 'self';
                         script-src 'self' 'wasm-unsafe-eval';
                         style-src 'self' 'unsafe-inline';
                         img-src 'self' data: blob:;
                         font-src 'self' data:;
                         connect-src 'self' ws: wss:;
                         worker-src 'self' blob:;
                         child-src 'self' blob:;
                         frame-src 'self' blob:;
                         object-src 'none';
                         base-uri 'self';
                         form-action 'self';
                         frame-ancestors 'self';
                         upgrade-insecure-requests
```

Plus:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-site
```

### 2.3 Directive-by-directive justification

| Directive                                   | Value                       | Why                                                                                                                                                                            |
| ------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `default-src`                               | `'self'`                    | Strict deny by default. Anything that needs more must be explicitly listed.                                                                                                    |
| `script-src`                                | `'self' 'wasm-unsafe-eval'` | Bundle is self-hosted; `wasm-unsafe-eval` is required for the WASM modules in `packages/geometry-kernel` (CDT triangulation, constraint solver). NO `unsafe-inline`, NO `unsafe-eval`. |
| `style-src`                                 | `'self' 'unsafe-inline'`    | Vite 7 + the SPA emit inline `<style>` for runtime theme. Migrating to CSP nonces is tracked at S70 D6 a11y audit (because nonce wiring also unblocks several WCAG fixes). Until then, `'unsafe-inline'` accepted as a known limitation. |
| `img-src`                                   | `'self' data: blob:`        | `data:` for inline SVG icons; `blob:` for thumbnail previews returned from MinIO (delivered as blob URLs via the `/v1/projects/:id/thumbnail` route).                         |
| `font-src`                                  | `'self' data:`              | Bundled fonts (`Inter`, `JetBrains Mono`); `data:` for icon-font fallback.                                                                                                     |
| `connect-src`                               | `'self' ws: wss:`           | XHR + fetch + WebSocket. The `ws:` is required for self-host without TLS; `wss:` for production. Tightening to `'self'` only is tracked at S70 D8 (TLS termination + HSTS preload). |
| `worker-src`, `child-src`, `frame-src`      | `'self' blob:`              | Web Workers spawned from blob URLs by the bake-worker preview path (`apps/editor/src/preview-worker`). Plugin iframes use `srcdoc`; `frame-src 'self' blob:` covers both.      |
| `object-src`                                | `'none'`                    | No `<object>` / `<embed>` / `<applet>` use anywhere.                                                                                                                           |
| `base-uri`                                  | `'self'`                    | Prevent `<base href="evil">` injection from rewriting all relative URLs.                                                                                                       |
| `form-action`                               | `'self'`                    | Forms POST only to our own origin. Stripe checkout (S71) will need to add `https://checkout.stripe.com`; tracked.                                                              |
| `frame-ancestors`                           | `'self'`                    | The editor cannot be iframed by third parties — defeats clickjacking + plugin host-spoofing.                                                                                   |
| `upgrade-insecure-requests`                 | (no value)                  | Force the browser to upgrade `http://` subresources to `https://` once TLS termination lands at S70 D8.                                                                        |

### 2.4 Verification

- The header is present on every response from the `editor` nginx container — verifiable post-deploy via `curl -sI http://<host>:3000/ | grep -i content-security-policy`.
- The header does not block legitimate editor functionality — verified by inspection against the editor's known fetch + worker + style patterns.
- **Not yet verified end-to-end** in a running browser (no Docker daemon in dev env). First operator boot of the self-host stack at S70 D8 publish gate will surface any console CSP violations; S68 D8 remediation buffer absorbs short-fix items.

---

## §3 Boundary 2 — Plugin iframes (sandboxed)

### 3.1 Posture

Plugin iframes use the `<iframe sandbox="allow-scripts">` attribute (no `allow-same-origin`, no `allow-top-navigation`, no `allow-popups-to-escape-sandbox`, no `allow-modals`). The CSP is delivered via `<meta http-equiv="Content-Security-Policy">` injected as the first child of `<head>` by `packages/plugin-sdk/src/sandbox/policy.ts::buildIframeHeadHTML`.

The CSP is generated per-plugin from the manifest (`buildPluginCSP(manifest)`):

```text
default-src 'none';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src <manifest.allowedOrigins | 'none'>;
frame-src 'none';
worker-src 'none';
object-src 'none';
base-uri 'self';
form-action 'none';
frame-ancestors 'self';
```

### 3.2 Audit findings

Three observations from this audit, all of them **already addressed in the existing code** (verified by reading `packages/plugin-sdk/src/sandbox/policy.ts` and the escape-test suite):

1. **`script-src 'unsafe-inline'` inside the plugin iframe** — flagged but accepted: the iframe is opaque cross-origin (`sandbox="allow-scripts"` without `allow-same-origin`), so even a script-injection bug inside the iframe cannot read the host's cookies, localStorage, or DOM. The iframe is a kill-zone by design. The escape-test suite at `packages/plugin-sdk/__tests__/escape-tests.test.ts` proves the boundary holds.
2. **`connect-src` defaults to `'none'`** when the `network:fetch` permission is absent — confirmed by reading `policy.ts` lines 64–73. When the permission IS present, `connect-src` lists only manifest-declared `allowedOrigins`; the manifest schema enforces `allowedOrigins.length > 0` when `network:fetch` is granted (ADR-0038 §Decision E). Defence-in-depth fallback to `'none'` if the array is empty.
3. **`frame-ancestors 'self'`** — pinned to host's origin so a third-party page cannot iframe the plugin iframe and trick the user into authorising. Confirmed by reading `policy.ts` line 95.

### 3.3 Independent confirmation (S68 D4)

A genuine third-party sandbox audit by an external security firm is the SUFFICIENT condition for the K3-C gate (per `docs/03-execution/plans/legacy/phases/PHASE-3/3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md` §S62 D7). That audit is **scheduled for S68 D4 calendar-relative and tracked outside this repo**. The findings will be appended to `docs/04-reference/security/plugin-sandbox-audit-2026-Q4.md` §4 when received.

---

## §4 Reporting endpoint (deferred)

`Content-Security-Policy-Report-Only` + `report-uri` / `report-to` directives are **deferred to S70 D8** (self-host publish day, when production TLS endpoint is known). The plumbing — a `POST /v1/csp-report` endpoint in `apps/api-gateway` plus rate-limit + audit-log wiring — fits in one day of S70 D8. Until then:

- Browser console violations are the reporting channel during private beta.
- Operators on self-host can wire their own report endpoint by adding a `report-to` directive in their nginx override.

---

## §5 What this audit does NOT claim

- It does **not** claim end-to-end browser verification — the editor SPA has not been booted under the new CSP in a browser inside this sprint (no Docker daemon in dev env). First operator boot at S70 D8 is the verification gate.
- It does **not** claim CSP nonces are in place — `style-src 'unsafe-inline'` remains; nonce migration tracked at S70 D6.
- It does **not** claim CSP reporting is wired — `report-to` deferred to S70 D8.
- It does **not** replace the third-party sandbox audit (S68 D4) or the third-party pen test (S68 D1–D2).
- It does **not** cover `pryzm.com` or `docs.pryzm.com` marketing surfaces — S71 D7.

---

**Authored by**: sprint-S68 (2026-04-28)
**Companion docs**: `docs/04-reference/security/scans-2026-Q4-baseline.md`, `docs/04-reference/security/plugin-sandbox-audit-2026-Q4.md`.
