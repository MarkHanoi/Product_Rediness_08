---
title: PRYZM Developer Docs
description: Developer documentation for the PRYZM BIM platform — Plugin SDK, REST API, and Headless mode.
---

# PRYZM Developer Docs

Welcome. This site is the canonical developer reference for the PRYZM BIM
platform.

The site is organized into three top-level sections:

- **Plugin SDK** — build plugins that run inside the PRYZM editor. Manifest
  format, permissions, sandbox model, host API surface, examples, and
  distribution / signing.
- **REST API** — call PRYZM from CI pipelines, headless servers, or external
  integrations. OAuth2-protected endpoints for `.pryzm` import/export per
  [SPEC-26 §8](https://github.com/pryzm-com/pryzm). The OpenAPI 3.1 schema is
  the source of truth.
- **Headless** — run PRYZM as a CLI for batch authoring, validation, and
  format conversion.

> **S63 D1 status.** This site is the foundational scaffold landed at S63 D1
> per ADR-0039. Page bodies are placeholders; full content lands D2-D9 of S63
> per `phases/PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md` §3. Track
> progress in `apps/docs-site/INVENTORY.md`.
