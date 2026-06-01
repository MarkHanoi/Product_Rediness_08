# ADR-037 — Hybrid Sovereignty Default: Cloud-Region (Auto-Selected)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-04-27 |
| Phase | 4 (M37–M42) |
| Deciders | Architecture lead, Enterprise lead |
| Related | SPEC-34 |

## Context

SPEC-34 defines five sovereignty modes (local-only / cloud-public / cloud-region / hybrid / self-host). The default applies to every new project at creation. Three default options:

1. **cloud-public** (lowest friction, shared bucket).
2. **cloud-region** (auto-selected from inferred locale).
3. **local-default** (browser-only until user opts to sync).

## Decision

**cloud-region** with `region` auto-selected from inferred locale (browser language + timezone + IP). User can downgrade or upgrade. Region change triggers re-pack + transfer.

## Consequences

**Positive**
- GDPR / Schrems II compliant by default for EU users.
- BCA / NCA / ISM compliant by default for SG / SA / AU users.
- No surprise data transfer outside region without explicit consent.
- "We default to your jurisdiction" is a marketing line.

**Negative**
- Multi-region infrastructure cost (cluster per region from launch).
- Cross-region collab adds latency (mitigated by SPEC-34 NFTs).

**Risks**
- Inferred locale wrong → wrong region. Mitigated by pre-creation region picker + warning.

## Alternatives considered

- **cloud-public** — rejected: GDPR exposure.
- **local-default** — rejected: kills the multi-user wedge for new users.
