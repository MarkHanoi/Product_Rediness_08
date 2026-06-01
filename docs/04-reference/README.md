# 04-reference — LOOKUP

> Reference material: API · glossary · file formats · architecture detail · security · observability.
>
> Things you LOOK UP when you need an exact answer. Not things you READ end-to-end.

## §1 — What lives here

Material that's stable, exact, and fact-based. Not strategic, not bound, not status — just **the truth about a specific thing**.

| Folder | What's inside |
|---|---|
| [architecture-detail/](./architecture-detail/) | Deep architecture documentation — per-package, per-subsystem, design diagrams (~28 files) |
| [file-formats/](./file-formats/) | `.pryzm` binary format spec, family format, IFC4X3 dialect notes |
| [security/](./security/) | CSP audits, OAuth2 reviews, plugin-sandbox audits, RLS audits, SAML/SCIM mappings, secret-rotation playbooks |
| [observability/](./observability/) | OTel dashboard exports (Honeycomb, Tempo configs) |
| [audit/](./audit/) | Historical curtain-wall + wall-batch + THREE-decoupling audits (architecture detail) |
| [runbooks/](./runbooks/) | Operational runbooks (deploy, recovery, on-call) |

## §2 — Loose files at this root

| File | Purpose |
|---|---|
| [visibility-and-selection.md](./visibility-and-selection.md) | The architectural reference for visibility-intent + selection (P7 deep-dive) |
| [pascalorg-editor-research.md](./pascalorg-editor-research.md) | Research notes on the Pascal editor (cousin architecture; informed several PRYZM decisions) |
| [typecheck-error-queue.md](./typecheck-error-queue.md) | Live queue of TypeScript errors with triage state |
| [typecheck-errors-2026-05-24.txt](./typecheck-errors-2026-05-24.txt) | Snapshot of compiler errors at that date |

## §3 — Naming + content conventions

### Filename

- Kebab-case lowercase: `csp-audit-2026-q4.md`, `pryzm-binary.md`
- Dated audits may end `*-YYYY-QN.md` for the calendar quarter when they apply.

### Content shape

- **Exact facts** (table of properties, field types, defaults).
- **Examples** (concrete payloads, sample IFC entities, sample DB rows).
- **Glossary entries** (term → definition + example).
- **Pointers** (links into code modules — `[FacadeValueField](../../packages/ai-host/src/workflows/apartmentLayout/environment/facadeValueField.ts)`).

### What does NOT belong

- **Decisions** → [../02-decisions/adrs/](../02-decisions/adrs/)
- **Specs** (algorithm contracts) → [../03-execution/specs/](../03-execution/specs/)
- **Status** → [../03-execution/status/](../03-execution/status/)
- **Strategy** → [../01-strategy/](../01-strategy/)
- **Guides** (how-to) → [../05-guides/](../05-guides/)

## §4 — Cross-links

- API reference (auto-generated): [apps/docs-site/](../../apps/docs-site/)
- Architecture overview: [../01-strategy/architecture.md](../01-strategy/architecture.md)
- Contract suite: [../02-decisions/contracts/](../02-decisions/contracts/)
