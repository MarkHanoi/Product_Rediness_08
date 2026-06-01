# M24 Beta Gate Report — Phase 2D Closure

- **Status**: DRAFT (S47 D9 — cut-list checkpoint recorded; full report drafted at S48 D6)
- **Date opened**: 2026-04-28
- **Sprint**: S47
- **Spec**: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S48 (M24 beta gate exit criteria, lines 727-790)

---

## §1 Cut-list checkpoint (S47 D9 retro per `[strategic ADR-018]`)

Per spec lines 642-651, the four Tier-1 cuts checkpointed at S47 D9:

| Cut ID | Description | Default | S47 D9 decision | Rationale |
|---|---|---|---|---|
| T1.1 | Defer dimensions in section view to S49 | not cut | **NOT CUT** | S35-S37 already shipped section-view + dimensions parity; deferring would re-open a closed sprint. No capacity pressure. |
| T1.5 | Defer sheet schedule-snapshot widget richness | not cut | **NOT CUT** | S40-S42 closed schedule + sheet widgets at adequate richness; no beta-cohort feedback yet to motivate further cuts. |
| T1.7 | Defer multi-region sync replication | cut (per S43) | **STAYS CUT** | Not required for beta cohort (single-region Supabase suffices); cost + complexity vs. cohort size of 25 invitees does not justify. |
| T1.8 | Defer awareness compaction beyond throttle | cut (per S43) | **STAYS CUT** | S44 awareness throttle (60 Hz) is sufficient for the < 5 concurrent users in any single C1/C2 project; compaction lands when needed. |

**Decision**: founder + agent jointly ratified the default cuts per spec line 651. No Tier-1 escalation required to land M24.

**Cross-reference**: `docs/02-decisions/adrs/0037-ai-host-lazy-bootstrap.md` §2.6.

---

## §2 Bench gates — to be run at S48 D6

Per spec lines 689-695:

- [ ] `pnpm bench restore-verify` green for ≥ 7 consecutive nights (gate predicate `restoreVerifyGateGreen` from S46 — green-streak counter at `.local/restore-verify-streak.json` per ADR-0036).
- [ ] `pnpm spec:audit-storage` green (no production code creates a table not in the SPEC-24 §4 storage map).
- [ ] `pnpm bench yjs-collab` shows ≤ 250 ms broadcast lag p95 at 50 concurrent users.
- [ ] AI cost dashboard reflects live `ai_usage` rows; pre-call cap rejection works (S49 deliverable — flagged per ADR-0037 deferred bindings).
- [ ] All references to `service_role` Supabase keys removed from production routes.
- [ ] `node scripts/check-ai-host-lazy.mjs` green (S47 D1 enforcer).
- [ ] `vite build --report` confirms `packages/ai-host/AiHost.impl` is in a separate chunk (S47 D1 spec line 611 — runtime side of the K3-A gate).

---

## §3 Functional readiness — to be filled at S48 D6

Per spec lines 729-735:

- [ ] ~18 element families operational.
- [ ] Plan view + section view + sheets + 10 widgets + PDF export + schedules + 3 export formats functional.
- [ ] Multi-user real-time geometry collab via Yjs; awareness; soft locks (S43 + S44 + S45 done; cutover D9 binding pending).
- [ ] Visibility-Intent waves 1-5 parity-tested (S46 done — 35/35 tests green).
- [ ] AI host lazy-loaded with approval queue UI (S47 store + S48 React binding).

---

## §4 Performance, cohort, architecture, persistence, AI gates

To be drafted at S48 D6 per spec lines 737-789. Skeleton headers retained here for traceability:

### §4.1 Performance — spec lines 737-744
### §4.2 Beta cohort — spec lines 746-751
### §4.3 Architecture — spec lines 753-758
### §4.4 Persistence + storage — spec lines 760-765
### §4.5 AI — spec lines 767+

---

## §5 Sign-off

- [ ] Founder + agent joint sign-off (S48 D8).
- [ ] LAUNCH (S48 D9 Tuesday).
- [ ] First 48-hour monitoring + retro (S48 D10).

---

*This file opens at S47 D9 and closes at S48 D10. All cells above marked `[ ]` are S48 deliverables; the cut-list checkpoint at §1 is the only S47 decision recorded here.*
