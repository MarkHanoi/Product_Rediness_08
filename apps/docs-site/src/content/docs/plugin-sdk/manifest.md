---
title: Manifest Reference
description: The plugin.manifest.json schema — fields, contributions, permissions, validation rules.
---

# Manifest Reference

Every PRYZM plugin ships with a `plugin.manifest.json` at its root.
The schema is locked at v1 per
[ADR-0038](https://github.com/pryzm-com/pryzm/blob/main/docs/architecture/adr/0038-s62-plugin-sdk-descriptor-schema-lock.md);
breaking changes are a one-year deprecation cycle minimum.

## Top-level fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `pryzmPlugin` | `"1.0"` literal | yes | Schema version pin. v2 manifests will declare `"2.0"`. |
| `id` | string | yes | Lower-kebab-case, 3–64 chars, must match `^[a-z][a-z0-9-]{2,63}$`. |
| `version` | string | yes | Strict `MAJOR.MINOR.PATCH` semver — pre-release tags not allowed. |
| `displayName` | string | yes | 2–80 chars; rendered in plugin chrome. |
| `description` | string | yes | ≤ 500 chars. |
| `author` | string | yes | Free-form; the marketplace ties this to the publisher record. |
| `homepage` | URL | no | Must be `https://`. |
| `main` | string | yes | Entry point relative to plugin root (e.g. `dist/index.js`). |
| `icon` | string | no | SVG data URI or icon-registry name. |
| `license` | string | no | Default `"MIT"`. |
| `permissions` | string[] | yes | Subset of [the 7 locked permissions](/plugin-sdk/permissions). |
| `allowedOrigins` | string[] | yes | Required non-empty when `network:fetch` is granted (validation rule below). |
| `contributions` | object[] | yes | The 5 locked contribution kinds (see below). May be empty. |
| `minPRYZMVersion` | string | yes | Strict semver; the editor rejects activation if its version < this. |
| `pricingModel` | `"free"` / `"one-time"` / `"subscription"` | no | For marketplace listings only. |
| `pricingCurrency` | string | no | ISO 4217 (e.g. `"USD"`). |
| `pricingAmount` | number | no | In `pricingCurrency` units. |

## The 5 contribution kinds

Contributions are a discriminated union on `kind`:

### `tool`
Adds a viewport tool.

```json
{
  "kind": "tool",
  "id": "wall-counter.tool",
  "label": "Count walls",
  "icon": "data:image/svg+xml;base64,PHN2Zy4uLjwvc3ZnPg==",
  "toolbar": "left"
}
```
- `toolbar`: `"left"` / `"right"` / `"top"` / `"floating"`.
- Requires permission `register:tool`.

### `panel`
Adds a docked panel.

```json
{
  "kind": "panel",
  "id": "wall-counter.panel",
  "location": "sidebar-right",
  "label": "Wall Counter"
}
```
- `location`: `"properties"` / `"sidebar-left"` / `"sidebar-right"` / `"bottom"`.
- Requires permission `register:panel`.

### `command`
Adds a command-palette entry (with optional keybinding).

```json
{
  "kind": "command",
  "id": "wall-counter.recount",
  "label": "Recount walls",
  "keybinding": "Ctrl+Shift+W",
  "category": "Walls"
}
```
- Requires permission `register:command`.

### `element-type`
Adds a new element kind backed by a `.pryzm-family` file.

```json
{
  "kind": "element-type",
  "id": "acme-curtain-wall",
  "label": "Curtain Wall (ACME)",
  "ifcEntityType": "IfcCurtainWall",
  "familyFile": "families/curtain-wall.pryzm-family"
}
```
- `familyFile`: path within plugin package.

### `view-template`
Adds a new view template.

```json
{
  "kind": "view-template",
  "id": "ground-floor-doors-only",
  "label": "Ground floor — doors only",
  "templateFile": "templates/doors-only.json"
}
```
- `templateFile`: JSON matching the host's `ViewTemplateSchema`.

## Validation rules

`@pryzm/plugin-sdk/descriptor` exposes `validateManifest(raw)`:

```ts
import { validateManifest } from '@pryzm/plugin-sdk/descriptor';

const result = validateManifest(JSON.parse(raw));
if (!result.ok) {
  for (const err of result.errors) console.error(`  • ${err}`);
  process.exit(1);
}
```

Errors are sorted by dot-path so output is stable across runs.

### Cross-field rule: `network:fetch` ⇒ non-empty `allowedOrigins`

Per [ADR-0038](https://github.com/pryzm-com/pryzm/blob/main/docs/architecture/adr/0038-s62-plugin-sdk-descriptor-schema-lock.md) §Decision E, a manifest that grants `network:fetch` MUST list at least one entry in `allowedOrigins`. The reasoning: silent fall-through to "fetch denied at runtime" is a worse failure mode than upfront validation reject.

```json
// ❌ Rejected at validateManifest()
{ "permissions": ["network:fetch"], "allowedOrigins": [] }

// ✓ Accepted
{ "permissions": ["network:fetch"], "allowedOrigins": ["https://api.example.com"] }
```

## Versioning policy

The schema version `pryzmPlugin: "1.0"` is locked for v1.x. Any
breaking change to fields, contribution kinds, or permission set requires:

1. A sprint-scoped ADR amending [ADR-0038](https://github.com/pryzm-com/pryzm/blob/main/docs/architecture/adr/0038-s62-plugin-sdk-descriptor-schema-lock.md).
2. A 1-year deprecation cycle.
3. A bump to `pryzmPlugin: "2.0"` (existing v1 plugins continue to work in parallel).

## See also

- [Permissions](/plugin-sdk/permissions) — the 7 locked permissions.
- [Sandbox Model](/plugin-sdk/sandbox) — what the iframe + CSP enforce.
- [Distribution](/plugin-sdk/distribution) — signing + marketplace publishing.
