# ADR-018 — Capacity Cut List (Velocity-Slip Triage)

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `CONFLICT-ANALYSIS.md §6.3`; `CRITICAL-REVIEW-2026-04-27.md §A4` and §E4 |
| Required by | Sprint S22 (M12 alpha gate — first capacity-vs-velocity reconciliation) |
| Owner | Architecture lead + delivery PM |
| Implementation | Quarterly review at each phase gate (M12, M24, M36); cuts logged in `docs/operations/cut-list-log.md`. |
| Spec dependency | `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §risks; per-spec cut lines (e.g. SPEC-09 §7.1). |

---

## Context

The 36-month plan budgets 72 sprints over 5 phases (M1–M3 rails, M4–M12 alpha, M13–M24 beta, M25–M36 GA). `CRITICAL-REVIEW-2026-04-27.md §A4` and §E4 warn that velocity will slip — historically architecture-grade rewrites slip 30–60% on first pass. Without a pre-agreed cut list, slip becomes an emergency every quarter, decisions get made under deadline pressure, and the wrong things ship.

This ADR defines **what gets cut, in what order, at what slip level**. It is the standing menu for the steering committee.

---

## Decision

**A standing cut list, ordered. At each phase gate (M12 / M24 / M36), measured velocity is compared to plan; cuts apply in order until the plan is back on schedule.**

### Velocity-slip thresholds and tier of cuts

| Slip vs plan | Tier | Action |
|---|---|---|
| 0–10% | Green | No cut. Reforecast next quarter. |
| 10–20% | Amber-1 | Apply Tier-1 cuts. Communicate to design partners. |
| 20–40% | Amber-2 | Tier-1 + Tier-2. Re-baseline next phase gate. |
| 40–60% | Red | Tier-1 + Tier-2 + Tier-3. Escalate to leadership. Consider M-date slip. |
| > 60% | Critical | All tiers. Reset GA-date. Possible scope rebaseline. |

Slip is measured per phase, not per sprint, against the milestones in `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §phase-deliverables.

### Tier 1 cuts (apply first; smallest customer impact)

| # | Cut | Saves | Why first |
|---|---|---|---|
| T1.1 | Marketplace v1 → first-party-only (no third-party SDK at launch) | ~2 sprints in S64–S66 | Per SPEC-09 §7.1; if launch partners aren't signed by S60 this is the default. |
| T1.2 | AP-Southeast region deferred from M36 to v2 | ~1 sprint S70 | Per SPEC-08 §8.1; serves 8% of TAM. |
| T1.3 | Schedule formula DSL → fixed-formula library only (no user-authored expressions) | ~3 sprints S35–S38 | Per ADR-027; DSL is a power-user feature; library covers 90% of asks. |
| T1.4 | View-template inheritance → flat templates only (no template-of-template) | ~1 sprint S31 | Most teams use ≤2 template levels. |
| T1.5 | PDF export server-side only (no in-browser PDF in v1) | ~2 sprints S33 | Per SPEC-04; in-browser PDF is a UX nicety; server PDF works for everyone. |
| T1.6 | WebAuthn / passkeys deferred from M36 to v2 | ~1 sprint S72 | Per SPEC-08 §2.3; TOTP MFA is sufficient for v1 enterprise. |
| **T1.7** | **PDF-to-BIM tier-1 degradation: drop slab inference; ship walls + doors + windows only** | ~1 sprint S55 | Per ADR-029 Part F. Slab inference is the lowest-confidence extraction; review-queue burden falls disproportionately on slabs. Customers can model floors manually. |
| **T1.8** | **Schedule formula library reduced from 24 → 14 functions** | ~1 sprint S41 | Per ADR-027 Part C. The 14 retained (`count`, `sum`, `avg`, `min`, `max`, `area_total`, `volume_total`, `perimeter_total`, `length_total`, `cost_total`, `if`, `coalesce`, `format`, `parameter`) cover ≥85% of measured usage in PRYZM 1; the 10 deferred go to v2. |

**Tier 1 budget: ~12 sprints reclaim.** Sufficient for 10–20% slip without touching customer-visible functionality at GA.

### Tier 2 cuts (apply when 20–40% slipping)

| # | Cut | Saves | Why second |
|---|---|---|---|
| T2.1 | DXF export → marketplace plugin (post-GA) | ~3 sprints S55–S57 | Round-tripped via IFC for most workflows; DXF covers a niche. |
| T2.2 | Component Editor (D10 — loadable families) deferred from Phase 3A to v2 | ~6 sprints S49–S54 | Major scope reduction. Customers ship with the 12/8/8/8/40 catalog (per ADR-017 §7) + custom *types* (not new families). Constraint solver (ADR-024) deferred with it. |
| T2.3 | Audit-log streaming → Postgres-only (no webhook to SIEM) | ~1 sprint S64 | Per SPEC-08 §7.3; customers can poll. |
| T2.4 | SCIM provisioning deferred from M36 to v2 | ~2 sprints S58–S59 | SAML/OIDC + just-in-time provisioning covers most needs. |
| T2.5 | Self-host air-gap install reduced to "online install only" | ~1 sprint S64 | Per ADR-012; air-gap is a niche enterprise ask. |
| T2.6 | Multi-region data residency reduced to single-region (per-tenant region-pinning still works) | ~2 sprints S70 | Customers select region at signup; one region per install. |

**Tier 2 budget: ~15 sprints reclaim. Cumulative T1+T2: ~25 sprints.**

### Tier 3 cuts (apply when 40–60% slipping)

| # | Cut | Saves | Why third |
|---|---|---|---|
| T3.1 | AI L7.5 reduced from generator+critic+modifier to **critic-only** at GA | ~6 sprints S30–S35 | Per SPEC-07; critic = lowest-risk highest-value. Generators ship in v2. |
| T3.2 | Concurrent-user target reduced from 50/project to 20/project | ~3 sprints S67–S69 | Per SPEC-03 §9; 20 is acceptable at GA, 50 is a stretch. |
| T3.3 | IFC export reduced to walls + slabs + columns + beams + doors + windows + spaces (drop stairs, railings, curtain wall, furniture) | ~4 sprints S55–S58 | Per ADR-008; the core 6 cover 80% of IFC handoffs. |
| T3.4 | Plugin sandbox security pen test reduced from external to internal | ~1 sprint S68 | Riskier; only acceptable if customer base is small at GA. |
| T3.5 | M36 GA target slipped to M40; Phase 3 stretched | (no scope cut) | Last-resort move; preserves scope but slips the date. |

**Tier 3 budget: ~14 sprints reclaim (T3.1–T3.4) + a date slip option (T3.5).**

### Decision protocol
1. At each phase gate (M12, M24, M36), the delivery PM produces a "velocity report" comparing actual to plan.
2. The steering committee reviews and selects cuts in order.
3. Selected cuts are logged in `docs/operations/cut-list-log.md` with reasoning + customer-comms note.
4. Customer-visible cuts get a 14-day notice to design partners before they're announced publicly.
5. A cut once applied is irreversible within the v1 cycle; it can be re-considered for v2.

### Anti-patterns this ADR forbids
- **Don't** cut from L4 (geometry kernel) — robustness budget (per ADR-020) is the floor; cutting it ships an unstable product.
- **Don't** cut from sandbox security (ADR-009) without a pen test substitute.
- **Don't** cut from observability (P8 / ADR-007) — losing telemetry hides the cuts' effects.
- **Don't** cut from RLS / audit log integrity (SPEC-08 §4 / §7) — regulated customers walk.
- **Don't** silently re-baseline; every cut goes in the public log.

---

## Consequences

**Positive:**
- Pre-agreed menu means cuts happen calmly, not as fire drills.
- Customer-comms is rehearsed; no surprises at GA.
- The product team has a clear "what's on the chopping block" list to refer to during planning.
- Engineering can plan "if this cut, then this" alternative paths in advance.

**Negative:**
- Cuts visible in advance may anchor sales conversations on the deferred items.
- The list is opinionated and may be wrong about what's least painful; mitigated by quarterly review.
- A cut can become a permanent gap if v2 doesn't pick it up; explicit revisit list in `docs/operations/v2-candidates.md`.

---

## Alternatives considered

### No standing cut list — decide ad hoc each quarter
- Rejected: that's how products lose discipline at scale.

### Sliding-scope per quarter (no fixed M-dates)
- Rejected: design partners and Enterprise sales need date commitments.

### Time-box per phase, ship whatever's done
- Rejected: ships a product without coherent scope; reputation risk.

---

## Phase rollout
- S22 (M12 alpha gate) — first velocity reconciliation; Tier-1 cuts applied if amber.
- S30 (M18 mid-phase check) — interim review; no formal cuts unless red.
- S48 (M24 beta gate) — second reconciliation; Tier-2 cuts on the table.
- S60 (M30 mid-phase check) — go/no-go on T1.1 (marketplace) based on launch-partner signing.
- S66 (M33 pre-GA check) — final cut window before GA scope freeze at S70.
- S72 (M36 GA) — final accounting; deferred items moved to `docs/operations/v2-candidates.md`.
