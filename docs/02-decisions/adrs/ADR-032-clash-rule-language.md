# ADR-032 — Clash Classification Rule Language: Declarative JSON DSL

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-04-27 |
| Phase | 4 (M37–M42) |
| Deciders | Architecture lead, Geometry kernel lead |
| Related | SPEC-37, SPEC-31 §3 (LLM emission curve) |

## Context

Federated clash detection (SPEC-37) needs a rule language that BIM coordinators (not engineers) can read, write, version, and share. Three options:

1. **Declarative JSON DSL** — typed by JSON-schema; rule = data; evaluated by trusted engine code.
2. **Python sandbox** — rules are Python; pluggable; arbitrary expressivity.
3. **SPARQL** — rules query the linked-data layer (Phase 6); maximally semantic.

## Decision

**Declarative JSON DSL.** Rules are data. The engine is `apps/clash-engine/src/RuleEngine.ts`. Rule shape per SPEC-37 §2.2.

## Consequences

**Positive**
- BIM coordinators (non-engineers) can author rules.
- Rules version-control cleanly as JSON.
- Marketplace can publish rule packs without code review of executable logic.
- Sandbox-escape risk is zero (rules are data, not code).

**Negative**
- Some advanced rules (cross-element-set predicates, time-windowed) need DSL extensions over time.
- Cannot express SPARQL queries until DSL gains a `sparql` predicate (deferred to Phase 6).

**Risks**
- DSL surface area creep. Mitigated by ADR-required-for-DSL-extension policy.

## Alternatives considered

- **Python sandbox** — rejected: sandbox-escape risk, plugin author quality variance, marketplace trust impossible.
- **SPARQL** — rejected at Phase 4 (linked-data ships Phase 6); revisit for Phase 6 as `sparql` DSL predicate.
