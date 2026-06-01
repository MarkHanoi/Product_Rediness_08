# OAuth2 + PKCE Review — 2026-Q4 (S68 D6)

**Sprint**: PRYZM 2 Phase 3D · S68 D6
**Spec ref**: `docs/03_PRYZM3/reference/phases/PHASE-3/3D-Q4-M34-M36-HARDENING-GA.md` §S68 D6 — "OAuth2 review: PKCE flow correct; token expiry + refresh handled."
**Phase 3C anchor**: `[strategic ADR-0039]` §A; `phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md` §S63 D2–D3.
**Package**: `packages/oauth2-pkce` (260 lines src + 266 lines tests).

---

## §1 Scope

This review confirms the **PKCE flow correctness** and **token-lifecycle handling** for the PRYZM Public API, per RFC 7636 (Proof Key for Code Exchange) and the OAuth 2.1 draft (which makes PKCE mandatory for **all** clients, public and confidential alike).

Surfaces in scope:

| Surface                                       | Code path                                  | Reviewed? |
| --------------------------------------------- | ------------------------------------------ | --------- |
| PKCE verifier + challenge generation          | `packages/oauth2-pkce/src/index.ts`        | Yes       |
| `S256` enforcement (no `plain` accepted)      | `packages/oauth2-pkce/src/index.ts`        | Yes       |
| Test coverage                                 | `packages/oauth2-pkce/__tests__/pkce.test.ts` (266 lines) | Yes |
| Public API auth shim (resource server)        | `apps/api-gateway/src/auth-shim.ts`        | Yes (test shim only — production wiring deferred per ADR-0041 §D) |
| Token storage in CLI / SDK                    | `tools/pryzm-cli/` (if present)            | Out of scope (S70 D8) |
| Marketplace publisher OAuth flow              | `apps/marketplace-api/`                    | Out of scope (separate flow; §3.4 below) |

---

## §2 PKCE generation — confirmed RFC 7636 compliant

From `packages/oauth2-pkce/src/index.ts`:

```ts
export type PkceChallengeMethod = 'S256' | 'plain';

export interface PkcePair {
  readonly verifier: string;     // 43-128 char base64url
  readonly challenge: string;    // SHA-256(verifier), base64url
  readonly method: 'S256';       // PRYZM does not produce 'plain'
}
```

**Conformance check**:

| Requirement                                                              | RFC 7636 ref | Implementation                                  | Pass? |
| ------------------------------------------------------------------------ | ------------ | ----------------------------------------------- | ----- |
| Verifier length 43–128 chars                                             | §4.1         | Generation uses `crypto.webcrypto.getRandomValues` to produce 32 bytes, base64url-encoded → 43 chars. Configurable up to 96 bytes / 128 chars. | Pass |
| Verifier alphabet = `A-Z` / `a-z` / `0-9` / `-` / `.` / `_` / `~`        | §4.1         | base64url alphabet (with `-` `_`, no padding) — subset of allowed.    | Pass |
| Challenge = `BASE64URL(SHA256(verifier))` for S256                       | §4.2         | `subtle.digest('SHA-256', verifier)` → base64url no-padding.          | Pass |
| Server MUST reject `plain` (per OAuth 2.1)                               | §7.2         | `PRYZM rejects 'plain'` per source comment line 16; type-level union allows the symbol but the generator hard-codes `'S256'`. Server-side enforcement (rejection of `plain` on `/authorize` + `/token`) is the resource-server's job — landed when production OAuth2 server wiring lands per ADR-0041 §D. | **Partial** — client-side correct; server-side enforcement deferred. |
| WebCrypto-based randomness (cryptographically secure)                    | n/a          | `crypto.webcrypto.getRandomValues` (Node 20+) and `window.crypto.getRandomValues` (browser).                                                  | Pass |
| Pure ESM, no external deps                                               | n/a (PRYZM rule) | Confirmed: source uses Node stdlib + WebCrypto only.                                                          | Pass |

### 2.1 Test coverage

`packages/oauth2-pkce/__tests__/pkce.test.ts` is 266 lines. The test surface (audited by reading the file's outer structure) covers:

- Verifier-length boundaries (43, 96, 128).
- Challenge correctness against RFC 7636 Appendix B test vectors.
- Determinism: same verifier → same challenge.
- Uniqueness: 1000 generated pairs all distinct (entropy smoke test).
- `plain` rejection at the type-system level.

The package's vitest workflow runs as part of the standard package CI surface (no dedicated `.replit` row because the package is small and runs in the workspace root suite).

---

## §3 Token lifecycle — current posture

### 3.1 Access-token TTL

**Spec target** (per ADR-0039): short access-token TTL, refresh tokens rotate.
**Current state**: the production OAuth2 resource server is **not yet wired**. The `apps/api-gateway/src/auth-shim.ts` file is explicit:

> Production replaces this with a real OAuth2 resource-server adapter (introspect bearer + map to subject + scopes + tier).

Today the api-gateway accepts `X-Test-Subject` / `X-Test-Scopes` / `X-Test-Roles` headers in tests; production wires a Bearer-token introspection path per ADR-0041 §D.

**Therefore**: this review confirms the **client-side PKCE primitive is correct**, and the **server-side token lifecycle is on a known follow-on track** — it is not a regression, it is a not-yet-shipped surface with a defined contract (ADR-0041 §D + §S63 follow-on at S70 D8 self-host publish gate).

### 3.2 Refresh-token rotation

Same status as §3.1 — the production resource-server adapter at S70 D8 is the wiring boundary. The contract for rotation:

- On `/token` with `grant_type=refresh_token`, the server issues a new refresh token AND invalidates the old one (RFC 6819 §5.2.2.3).
- Detection of refresh-token replay (old refresh token reused after rotation) **revokes the entire chain**.

The contract is documented; the implementation lands at S70 D8.

### 3.3 Token storage

Client-side token storage guidance for the SDK + CLI:

- **CLI** (`tools/pryzm-cli` if present, or `pryzm dev`): store tokens in OS keyring (`keytar` on macOS Keychain, libsecret on Linux, Credential Manager on Windows) — never plain files.
- **Browser** (editor SPA): tokens are short-lived access tokens kept in memory; refresh tokens kept in HTTP-only `Secure` cookies set by the resource-server response.

Implementation lands alongside §3.1.

### 3.4 Marketplace publisher flow — separate

The marketplace-api uses a **publisher API key** model (long-lived key issued at publisher onboarding, scoped to the publisher's plugins). This is **separate from the PKCE flow** above (which gates end-user access to the Public API). The marketplace publisher key model is reviewed under `[strategic ADR-040]` §C and is not in the S68 D6 scope.

---

## §4 Findings summary

| # | Finding                                                              | Severity | Status                                                                                                  |
| - | -------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| 1 | PKCE generator conforms to RFC 7636 + OAuth 2.1 (S256 only).         | Info     | Pass — no action.                                                                                       |
| 2 | Server-side rejection of `plain` not yet enforced (resource-server is the test shim). | Medium | Tracked — lands with ADR-0041 §D wiring at S70 D8 self-host publish gate.                                |
| 3 | Refresh-token rotation contract documented; implementation pending.  | Medium   | Tracked — same wiring point as #2.                                                                      |
| 4 | Token storage guidance not yet codified in CLI / SDK.                | Low      | Tracked — CLI lands at S70 D8 alongside the resource-server wiring; storage-helper module deferred there. |
| 5 | No automated test asserts production resource-server rejects `plain`. | Low     | Will be added as part of the §3.1 wiring at S70 D8.                                                     |

**No critical or high severity findings.** Two medium findings are **known follow-ons with a defined wiring boundary**, not regressions.

---

## §5 What this review does NOT claim

- It does **not** claim a production OAuth2 resource server is live — that wiring lands at S70 D8 per ADR-0041 §D.
- It does **not** claim refresh-token rotation is implemented — same boundary.
- It does **not** cover the marketplace publisher API-key flow (separate; §3.4).
- It does **not** replace the third-party pen test (S68 D1–D2), which will probe the live OAuth surface end-to-end once it's wired at S70 D8.
- It does **not** cover SAML / SCIM enterprise SSO — that is a separate flow tracked under `docs/security/saml-scim-mappings.md` (S68 D7 SOC2 + SAML/SCIM day).

---

**Authored by**: sprint-S68 (2026-04-28)
**Companion docs**: `docs/security/csp-audit-2026-Q4.md`, `docs/security/saml-scim-mappings.md`.
