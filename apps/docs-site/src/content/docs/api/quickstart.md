---
title: REST API Quickstart
description: Authenticate with OAuth2 PKCE and call your first PRYZM REST endpoint in under five minutes.
---

# REST API Quickstart

The PRYZM Public API exposes the `.pryzm` import/export surface
described in SPEC-26 §8. This page walks you from "no credentials" to
"successful API call" using the OAuth2 PKCE flow.

> **API status:** `1.0.0-draft` (per [ADR-0039](https://github.com/pryzm-com/pryzm/blob/main/docs/architecture/adr/0039-s63-public-api-openapi-schema-and-docs-site.md) §D). The schema is
> stable for integration work, but breaking changes are permitted until
> S65 Public API GA. The `1.0.0` flip locks the schema for one year.

## 1. Register an OAuth2 client

In the PRYZM dashboard go to **Settings → Developer → OAuth Apps →
New App** and fill in:

| Field | Notes |
|---|---|
| Name | Free-form. |
| Redirect URI | Where PRYZM will return the user after consent. Must be `https://` (or `http://localhost:*` for development). |
| Scopes | Subset of `project:read`, `project:write`, `ai:invoke` (see [Authentication](/api/auth)). |

You'll get a **Client ID** (the `Client Secret` is intentionally NOT
issued — PKCE eliminates the need; see [Authentication](/api/auth) for
why).

## 2. Generate a PKCE code verifier + challenge

Use the SDK helper or implement RFC 7636 yourself:

```ts
import { generatePkcePair } from '@pryzm/oauth2-pkce';

const { verifier, challenge, method } = generatePkcePair();
// verifier: 43-128 base64url chars (cryptographically random)
// challenge: SHA-256(verifier), base64url-encoded
// method: 'S256'
sessionStorage.setItem('pkce_verifier', verifier);
```

## 3. Redirect the user to the authorization endpoint

```ts
const params = new URLSearchParams({
  response_type: 'code',
  client_id: 'YOUR_CLIENT_ID',
  redirect_uri: 'https://yourapp.example.com/oauth/callback',
  scope: 'project:read',
  state: crypto.randomUUID(),       // CSRF defence; verify on callback
  code_challenge: challenge,
  code_challenge_method: 'S256',
});
window.location.href = `https://auth.pryzm.com/oauth/authorize?${params}`;
```

The user authenticates, sees the consent screen with your requested
scopes, and is redirected back with `?code=...&state=...`.

## 4. Exchange the code for an access token

```ts
const verifier = sessionStorage.getItem('pkce_verifier');
const response = await fetch('https://auth.pryzm.com/oauth/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: receivedCode,
    redirect_uri: 'https://yourapp.example.com/oauth/callback',
    client_id: 'YOUR_CLIENT_ID',
    code_verifier: verifier!,
  }),
});
const { access_token, refresh_token, expires_in } = await response.json();
```

## 5. Call the API

Export a project as `.pryzm`:

```ts
const projectId = '...';
const exportResp = await fetch(
  `https://api.pryzm.com/v1/projects/${projectId}/export.pryzm`,
  {
    headers: { 'authorization': `Bearer ${access_token}` },
  },
);
if (!exportResp.ok) throw new Error(`Export failed: ${exportResp.status}`);
const blob = await exportResp.blob();
// `blob` is a ZIP archive per SPEC-26 §2 — write it to disk or upload elsewhere
```

Import a `.pryzm` file as a new project:

```ts
const tarballBytes = ...;
const importResp = await fetch('https://api.pryzm.com/v1/projects/import', {
  method: 'POST',
  headers: {
    'authorization': `Bearer ${access_token}`,
    'content-type': 'application/zip',
  },
  body: tarballBytes,
});
const { id, name } = await importResp.json();
console.log(`Imported as project ${id} (${name})`);
```

## Rate limits

| Tier | Read endpoints (e.g. export) | Write endpoints (e.g. import) |
|---|---|---|
| Free | 60 r/m | 20 r/m |
| Paid | 600 r/m | 300 r/m |
| Enterprise | Negotiated | Negotiated |

Limits are enforced per API key (or per user when there is no API key)
via a token-bucket per ADR-018. When you exceed the limit you'll get a
`429 Too Many Requests` with a `Retry-After` header.

See [Authentication](/api/auth) for refresh-token handling, scope
selection, and security best practices, and [OpenAPI Reference](/api/openapi)
for the full endpoint catalogue.
