# ADR-044 — Customer Migration (PRYZM 1 → PRYZM 2)

| Field | Value |
|---|---|
| Status | **Proposed** — 2026-04-29 (S73-WIRE D2) — **OVERDUE: deadline was S22 (M11)** |
| Closes | `CONFLICT-ANALYSIS.md` §6.10; `phases/audits/PRYZM2-WIREUP-PLAN-S72/25-architecture-docs-cross-alignment.md` §25.8.1; `PROCESS-TRACKER.md` §1 open decision row 4 |
| Required by | **Before any PRYZM 1 user is told about PRYZM 2** (any private-alpha announcement). Also gates sub-phase **G.32** — PRYZM 1 lights-out (S84 D9, last day of Phase G). |
| Owner | **Founder** + Architecture lead |
| Default if not ratified | Opt-in migration · snapshot-only · 12-month read-only PRYZM 1 access · founder-authored comms (per PROCESS-TRACKER §1) |

---

## Context

PRYZM 1 has paying customers with live projects. PRYZM 2 is a ground-up rebuild that ships with a different file format (`.pryzm` event log + chunk store), a different account model (the auth bridge in S71 W3 reconciles them at login), a different data model (12 element families plus contributions), and a different rendering pipeline.

`CONFLICT-ANALYSIS §6.10` flagged that the corpus has **no owner for the customer migration story**. Specifically, five operator decisions are unbound:

| # | Decision |
|---|---|
| **a** | Does PRYZM 1 stop accepting new projects at M24 Beta or M36 GA? |
| **b** | Is migration automatic on first PRYZM 2 login, opt-in via a button, or batch-only via support? |
| **c** | Is the full PRYZM 1 history replayed into the new event log, or is only the latest snapshot converted? |
| **d** | How long is PRYZM 1 read-only after migration — months / years / forever? |
| **e** | Per-tier (free / pro / enterprise) customer comms calendar — who is told what, and when? |

This ADR is **OVERDUE**. The latest sprint to land it is **S22 (M11)**, before any private-alpha announcement of PRYZM 2. We are at S72 / M36 with no announcement made yet, so the `OVERDUE` flag is procedural — no customer has been misled — but the ADR must be ratified before the first announcement.

---

## Decision (proposed default)

| # | Default | Rationale |
|---|---|---|
| **a** | PRYZM 1 stops accepting **new projects** at M36 GA. Existing PRYZM 1 projects continue to read+write until M48 (12-month sunset). | Avoids stranding customers mid-project. Stops new acquisition on the legacy stack the moment the new stack is GA. |
| **b** | **Opt-in** migration via a "Migrate to PRYZM 2" button in the PRYZM 1 hub. Default is no automatic migration. | Customers retain full agency. No surprise data movements. Auto-migration on first login risks data loss if the conversion has bugs. |
| **c** | **Snapshot-only.** Latest PRYZM 1 state is converted to a single seed event in the PRYZM 2 event log. PRYZM 1 history is preserved read-only on the legacy stack for the 12-month sunset. | Replaying full PRYZM 1 history is intractable (the data model differs). Snapshot conversion has well-understood semantics. |
| **d** | **12 months read-only**, M36 → M48. After M48, projects are exported to a `.pryzm-1-archive.zip` and PRYZM 1 lights out (sub-phase G.32). | 12 months is enough for any active customer to migrate or self-archive. Read-only avoids parallel-edit confusion. |
| **e** | **Founder-authored, three-stage comms**: (1) M30 — "PRYZM 2 is coming, sign up for private alpha"; (2) M36 — "PRYZM 2 is GA, here is the migration button"; (3) M42 — "PRYZM 1 sunset begins in 6 months". Per-tier wording differs (enterprise gets a dedicated migration call). | Founder voice is the operator's preference. Three stages give every customer at least 6 months notice before any forced action. |

---

## Consequences

- **G.32 (S84 D9)** — PRYZM 1 lights-out checklist runs only after the M48 sunset window closes. The wireup-plan window (S73-WIRE … S87-WIRE) ends in 2027-Q1, so G.32 is the **gating** sub-phase that sequences the 12-month sunset.
- The auth bridge (S71 W3) must distinguish PRYZM 1 read-only access from PRYZM 2 read-write access by token claim. SPEC-AUTH (already on disk) is amended to record the `pryzm-1-readonly` claim.
- The PRYZM 1 hub gains a "Migrate to PRYZM 2" button at M36; its handler calls a new `POST /api/migrate/pryzm1-to-pryzm2` route on the PRYZM 1 server which (a) triggers the snapshot conversion, (b) marks the source project read-only, (c) returns the new PRYZM 2 project ID for the redirect.
- The conversion routine is a new `packages/migration-pryzm1-to-pryzm2` package (1 file, ~400 LOC). Listed under sub-phase **C.4.08** (S75) — out-of-scope for Phase A; tracked in PROCESS-TRACKER §3 once the C window opens.
- `apps/marketing/` adds a `migration-faq.md` page sourced from this ADR.

---

## Status transitions

| Date | Status | Note |
|---|---|---|
| 2026-04-29 | Proposed | Authored as Phase A entry-gate stub (PROCESS-TRACKER §4) — **OVERDUE flag attached** |
| TBD | Accepted | Founder ratification required before first private-alpha announcement |
