# ADR-0049 — S67 D9 Multi-Region Cut Decision (Tier-2)

- **Status:** Accepted (sprint-scoped, S67 D9, 2026-04-28)
- **Sprint:** S67 (Phase 3D — Self-Host + Multi-Region Decision)
- **Authority:** subordinate to `[strategic ADR-018]` T2.6 (the "cuttable Tier-2
  capacity items" list), `docs/03-execution/specs/SPEC-15` §3.1
  (regional Supabase primaries), `docs/03-execution/specs/SPEC-24`
  §1.3 (regional data residency posture), and PHASE-3D §S67 exit criterion
  "multi-region decision recorded."
- **Supersedes:** none.
- **Superseded by:** none until post-GA roadmap revisits.

---

## §A — Decision

**Cut multi-region for M36 GA.**

PRYZM 2.0.0 ships single-region (one Supabase primary, one Postgres, one
MinIO bucket region).  EU-West + US-East regional Supabase primaries are
NOT provisioned for the M36 launch.

The `PRYZM_REGION` env var is reserved in `pryzm-selfhost/.env.example` so
post-GA reactivation is a deployment-config change, not a code change.

---

## §B — Why cut

`[strategic ADR-018]` T2.6 lists multi-region as a Tier-2 cuttable item
because:

1. **No measured demand at GA.** The beta cohort (S55–S65 sign-ups, ~80
   confirmed beta orgs as of S65 audit) is 90%+ North America.  No EU
   beta org has cited data-residency as a buying criterion.  No APAC
   beta org exists.

2. **Two-sprint cost.** Reverting the cut is explicitly costed at +2
   sprints in the phase doc §0 cut-list invariant ("if reverted, cost =
   2 sprints i.e. GA slips to ~M38").  S67–S72 has no slack to absorb
   that without burning the M36 launch window.

3. **Self-host satisfies most data-residency asks.**  An EU enterprise
   that needs data in EU can run the self-host stack on a Hetzner / OVH
   / Scaleway VM in Frankfurt today.  Multi-region SaaS is the
   convenience tier above that, not the only path.

4. **SOC2 sequencing.**  SOC2 certification is post-GA (~6 months per
   PHASE-3D §7).  Multi-region adds a per-region attestation surface.
   Doing both at once doubles the audit cost; sequencing them halves it.

5. **Operational maturity.**  The DR drill at S69 D6 establishes the
   single-region rollback runbook.  Practising DR on one region first,
   then expanding to multi, is the safer learning curve than launching
   multi and learning DR mechanics under live customer load.

---

## §C — What stays in to make a future revert easy

These items are kept in the M36 ship even though they aren't strictly
needed for single-region:

| Item                                              | Lives at                                              | Purpose post-revert                                  |
| ------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| `PRYZM_REGION` env var                            | `pryzm-selfhost/.env.example`                         | Region tag for SaaS multi-tenant routing             |
| Region-aware request logging                      | api-gateway OTel trace attributes (S65 D7)            | Region attribution for monitoring + cost split       |
| `region_pin` column in workspaces table           | reserved at S68 D5 RLS audit (forward-compat)         | Per-workspace region pinning                         |
| MinIO endpoint configurability                    | `MINIO_ENDPOINT` env var (already in compose)         | Per-region MinIO endpoints                           |
| Cross-region storage migration tool design        | TBD post-GA                                           | Move workspaces between regions on customer request  |

We do NOT ship:
- A second Supabase primary in EU.
- A regional read-replica.
- A geo-aware DNS layout.
- Per-region MinIO buckets.

---

## §D — What we owe customers who ask for EU residency at GA

A documented self-host playbook at `docs.pryzm.com/selfhost/` (S67 D7,
landed alongside this ADR) covers:

- Hetzner / OVH / Scaleway Frankfurt deployment.
- Postgres backup + restore for in-region disaster recovery.
- MinIO replication to a second EU host.
- Workspace migration export from PRYZM SaaS to self-host (S70
  migration tool).

Sales escalation routing for EU enterprise leads goes to a one-page
"self-host path" deck (out of scope here; handled by Track B at S71
marketing site work).

---

## §E — Reversal triggers (post-GA)

The cut is reversed (i.e., the +2 sprint multi-region work is scheduled)
when **any** of:

1. ≥ 3 paying enterprise customers cite EU data residency as a renewal
   blocker.
2. SOC2 audit identifies single-region as a finding requiring remediation.
3. Geographic ARR mix shifts to ≥ 30% EU + APAC combined and average
   round-trip latency to those regions exceeds 200 ms p95.
4. A regional regulatory event (e.g., EU data localisation enforcement)
   forces compliance.

Reversal owner: VP Engineering.  Decision review cadence: quarterly post-GA
(M37, M40, M43).

---

## §F — Consequences

**Positive:**
- M36 GA window protected.
- Lower SOC2 audit cost.
- DR muscle built on single region first.
- Self-host path covers most data-residency asks at zero per-customer cost.

**Negative:**
- A handful of EU SaaS prospects may defer.  Sales has a self-host
  fallback to offer.
- Re-introducing multi-region post-GA is a 2-sprint project, not a
  config flip.

**Reversibility:** medium.  The hooks in §C make a post-GA revert tractable
without rewriting the data layer; the missing piece is operational
(provisioning a second Supabase primary, geo DNS, regional MinIO mirroring).
