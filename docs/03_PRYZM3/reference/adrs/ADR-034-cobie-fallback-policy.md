# ADR-034 — COBie Mapping Fallback: Synthesise + Issue Row (Default)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-04-27 |
| Phase | 4 (M37–M42) |
| Deciders | Standards lead |
| Related | SPEC-36 |

## Context

COBie 2.4 export requires every Component row to have certain fields populated (Name, Space, ExtSystem, ExtObject). When element parameters are missing, three options:

1. **Hard error** — refuse to export until every required parameter is filled.
2. **Synthesise + Issue row** — generate a placeholder; log to `Issue` sheet for human review.
3. **Silent default** — generate placeholder, no log.

## Decision

**Synthesise + Issue row** as default. Hard-error mode available as per-project opt-in for high-stakes deliverables.

## Consequences

**Positive**
- Export is always producible (never blocks workflow).
- Issues are auditable (Issue sheet rows surface every synthesis).
- Maps the operational reality: BIM models are rarely 100% complete on first COBie drop.

**Negative**
- Risk of accepting an incomplete COBie export as "done" if Issue rows are ignored.

**Risks**
- Mitigated by: (a) NIBS validator surface Issue rows; (b) CDE state machine cannot transition past S6 with > 0 unresolved Issue rows (configurable).

## Alternatives considered

- **Hard error** — rejected as default: blocks workflow when 99% of fields are present.
- **Silent default** — rejected: violates audit principle.
