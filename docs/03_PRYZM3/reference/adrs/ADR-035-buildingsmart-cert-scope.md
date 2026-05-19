# ADR-035 — buildingSMART Certification Scope: RV + DTV (not CV 2.0)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-04-27 |
| Phase | 4 (M37–M42) |
| Deciders | Standards lead, Architecture lead |
| Related | SPEC-40, ADR-008 |

## Context

buildingSMART offers IFC4 certification for three Model View Definitions:
- **Reference View (RV) 1.2** — read + write; minimum for federation.
- **Design Transfer View (DTV) 1.0** — read + write; for cross-tool authoring round-trip.
- **Coordination View 2.0** — older view; being phased out by buildingSMART in favour of DTV.

Each scope adds ~30% certification effort and ~30% ongoing maintenance.

## Decision

**RV + DTV.** Coordination View 2.0 explicitly out of scope.

## Consequences

**Positive**
- Two certification badges = strong market signal.
- DTV is the one customers actually want for round-trip authoring.
- Skipping CV 2.0 saves ~30% effort + dodges a deprecating spec.

**Negative**
- A handful of legacy partners (Solibri, some Navisworks workflows) prefer CV 2.0.

**Risks**
- buildingSMART changes deprecation timeline. Mitigated by RV+DTV being the futures and CV 2.0 having a clear sunset path.

## Alternatives considered

- **RV only** — rejected: half the market signal; DTV is more valuable.
- **RV + DTV + CV 2.0** — rejected: 30% extra cost on a deprecating spec.
