---
title: OpenAPI Reference
description: The full PRYZM Public API surface, sourced from packages/api-spec/openapi.yaml.
---

# OpenAPI Reference

The PRYZM Public API is described by an OpenAPI 3.1 schema at
[`packages/api-spec/openapi.yaml`](https://github.com/pryzm-com/pryzm/blob/main/packages/api-spec/openapi.yaml).
The schema is hand-authored from SPEC-26 §8 per
[ADR-0039](https://github.com/pryzm-com/pryzm/blob/main/docs/architecture/adr/0039-s63-public-api-openapi-schema-and-docs-site.md) §B.

> **Schema status:** `1.0.0-draft` (per [ADR-0039](https://github.com/pryzm-com/pryzm/blob/main/docs/architecture/adr/0039-s63-public-api-openapi-schema-and-docs-site.md) §D).
> Breaking changes are permitted until S65 Public API GA. The `1.0.0`
> flip locks the schema for one year minimum (additive `1.x` changes
> only).

## Overview

| | |
|---|---|
| **OpenAPI version** | `3.1.0` |
| **Server** | `https://api.pryzm.com/v1` |
| **Authentication** | OAuth2 PKCE — see [Authentication](/api/auth). |
| **Rate limits** | Token-bucket per API key/user (60 r/m read, 20 r/m write on free tier — see [Quickstart §"Rate limits"](/api/quickstart#rate-limits)). |
| **Source of truth** | Hand-authored YAML; SHA-256 pinned in CI to catch accidental rewrites. |

## Endpoints

### `GET /projects/{projectId}/export.pryzm`

Export a project as a `.pryzm` v1 archive (ZIP per SPEC-26 §2).

**Scope:** `project:read`

| Parameter | In | Type | Notes |
|---|---|---|---|
| `projectId` | path | UUID | Required. |

**Response 200:** `application/zip` — the binary archive.

```sh
curl -H "Authorization: Bearer $TOKEN" \
  https://api.pryzm.com/v1/projects/$PROJECT_ID/export.pryzm \
  -o project.pryzm
```

### `POST /projects/import`

Import a `.pryzm` v1 archive as a new project.

**Scope:** `project:write`

**Request body:** `application/zip` — the binary archive.

**Response 201:** `application/json` matching the `Project` schema.

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/zip" \
  --data-binary @project.pryzm \
  https://api.pryzm.com/v1/projects/import
```

## Schemas

### `Project`

```yaml
type: object
```

The full schema is fleshed out in S64+ as the marketplace + project
APIs land. At `1.0.0-draft` the response carries an opaque project
object; the importer assigns the new project's UUID and surfaces
host-side metadata via the dashboard.

## Security schemes

```yaml
oauth2:
  type: oauth2
  flows:
    authorizationCode:
      authorizationUrl: https://auth.pryzm.com/oauth/authorize
      tokenUrl:         https://auth.pryzm.com/oauth/token
      scopes:
        'project:read':  Read project state
        'project:write': Create/update projects
        'ai:invoke':     Invoke AI workflows
```

Note: PKCE is enforced server-side for ALL clients. The schema doesn't
declare it explicitly because RFC 7636 defines PKCE as a flow extension,
not a separate flow type — `authorizationCode` with PKCE-required is
the standard way to express this.

## Tooling

To consume the YAML in your own toolchain:

- **OpenAPI Generator** — generate clients in 50+ languages.
- **Redoc / Swagger UI** — render rich API docs.
- **`@pryzm/api-spec`** — the loader package returns a parsed view of
  the YAML and runs invariant checks:

  ```ts
  import { loadOpenApiSpec, validateOpenApi3_1Invariants } from '@pryzm/api-spec';

  const { parsed } = loadOpenApiSpec();
  const violations = validateOpenApi3_1Invariants(parsed);
  if (violations.length) console.error(violations);
  ```

## Versioning policy

| Change | Version bump | Allowed before/after `1.0.0` GA |
|---|---|---|
| Add an endpoint | `1.x` | Both |
| Add an optional field to a schema | `1.x` | Both |
| Add a scope | `1.x` | Both |
| Remove an endpoint | `2.0` | Pre-GA only (after GA: 1-year deprecation cycle) |
| Remove a field | `2.0` | Same |
| Tighten a field's type | `2.0` | Same |
| Add a required field | `2.0` | Same |

The CI test suite at `packages/api-spec/__tests__/` pins a SHA-256 of
the YAML; any change requires updating the pin (and an ADR amending
[ADR-0039](https://github.com/pryzm-com/pryzm/blob/main/docs/architecture/adr/0039-s63-public-api-openapi-schema-and-docs-site.md)).

## Direct download

The raw YAML is at
[`packages/api-spec/openapi.yaml`](https://github.com/pryzm-com/pryzm/blob/main/packages/api-spec/openapi.yaml).
At S65 GA we'll publish a versioned mirror at
`https://api.pryzm.com/v1/openapi.yaml` for client codegen tooling.
