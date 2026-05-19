---
title: Authentication
description: OAuth2 PKCE flow, scopes, refresh tokens, and security best practices for the PRYZM Public API.
---

# Authentication

The PRYZM Public API uses **OAuth2 with PKCE** (RFC 7636) as its sole
authentication mechanism. There are no API keys, no client secrets, no
HTTP Basic Auth — every authenticated request carries a short-lived
bearer token obtained through the PKCE flow.

## Why PKCE-only?

PKCE (Proof Key for Code Exchange) eliminates the need for a client
secret. The flow uses a per-request `code_verifier` (high-entropy
random string) and its SHA-256 hash (`code_challenge`) to prove the
client that requested the authorization code is the same one
exchanging it for a token. This means:

- **Public clients (SPAs, CLIs, mobile apps) are first-class.** No
  secret-storage problem.
- **Compromised redirects can't replay codes.** The attacker doesn't
  have the verifier.
- **Aligns with [OAuth 2.1](https://oauth.net/2.1/).** PKCE is
  mandatory there; the PRYZM API enforces it for all clients now.

The trade-off — confidential clients lose nothing functional, since
the access-token TTL is always short and refresh tokens rotate.

## Scopes

The schema in `packages/api-spec/openapi.yaml` declares three scopes:

| Scope | Grants |
|---|---|
| `project:read` | Read project state — including the export endpoint. |
| `project:write` | Create or update projects — including the import endpoint. |
| `ai:invoke` | Invoke AI workflows on behalf of the user (cost charged to the project owner per SPEC-28 §9). |

Request only the scopes you need. The user-visible consent screen
lists requested scopes verbatim, so over-scoping is also a UX cost.

> **Important:** the `ai:invoke` *OAuth scope* and the plugin SDK's
> permission set are unrelated namespaces. The plugin SDK has no
> `ai:invoke` permission — plugin AI invocation is gated by
> `write:project` (see [Plugin SDK Permissions](/plugin-sdk/permissions)).

## The PKCE flow end-to-end

```
┌──────┐   1. /oauth/authorize?code_challenge=H(v)
│ App  │ ──────────────────────────────────────────►  ┌──────────────┐
│      │                                              │ auth.pryzm   │
│      │   2. user consents                           │              │
│      │ ◄────────────────────────────────────────── │              │
│      │   3. redirect with ?code=…                   │              │
│      │ ◄────────────────────────────────────────── │              │
│      │                                              │              │
│      │   4. /oauth/token POST { code, verifier }    │              │
│      │ ──────────────────────────────────────────► │              │
│      │   5. { access_token, refresh_token }         │              │
│      │ ◄────────────────────────────────────────── └──────────────┘
└──────┘
```

### Step 1 — generate the PKCE pair

```ts
import { generatePkcePair } from '@pryzm/oauth2-pkce';

const { verifier, challenge, method } = generatePkcePair();
// verifier:  43-128 chars, base64url(crypto-random bytes)
// challenge: base64url(sha256(verifier))
// method:    'S256'
```

The verifier is unguessable random; the challenge is its SHA-256 hash
in base64url. Store the verifier in `sessionStorage` (or your CLI's
`~/.pryzm/`-equivalent) — you'll need it at step 4.

### Step 2 — redirect with the challenge

```
https://auth.pryzm.com/oauth/authorize?
  response_type=code&
  client_id=...&
  redirect_uri=...&
  scope=project:read&
  state=...&
  code_challenge=...&
  code_challenge_method=S256
```

`state` is your CSRF defence — generate it fresh per flow and verify
the callback's `state` matches.

### Step 3 — handle the callback

The redirect URI is hit with `?code=...&state=...`. Verify `state`,
then proceed to step 4.

### Step 4 — exchange code for token

```
POST https://auth.pryzm.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=...&
redirect_uri=...&
client_id=...&
code_verifier=<the verifier from step 1>
```

Response:

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "scope": "project:read"
}
```

`access_token` is the bearer token for API calls; `refresh_token`
exchanges for a new access token after expiry.

## Refresh-token rotation

Every refresh response issues a NEW refresh token and invalidates the
previous one (rotation). If the same refresh token is presented twice,
all tokens in the family are revoked — assume the older one was stolen.

```
POST /oauth/token
grant_type=refresh_token&refresh_token=...&client_id=...
```

## Calling the API

```
GET /v1/projects/{projectId}/export.pryzm
Authorization: Bearer <access_token>
```

`401 Unauthorized` with `WWW-Authenticate: Bearer error="invalid_token"`
means the token expired or was revoked. `403 Forbidden` means the
token's scopes are insufficient — request additional scopes via a
fresh authorization round.

## Best practices

1. **Always use HTTPS.** Even local development goes through
   `https://localhost:*` — the auth server rejects plain HTTP.
2. **Use the `state` parameter.** It's the only CSRF defence on the
   redirect.
3. **Request minimum scopes.** Users decline plugins that ask for
   "everything"; the same applies to integrations.
4. **Rotate refresh tokens.** Don't pin to a specific `refresh_token`;
   always store the latest from each `/oauth/token` response.
5. **Handle 429.** Honour `Retry-After`; back off exponentially.

See [Quickstart](/api/quickstart) for a step-by-step worked example.
