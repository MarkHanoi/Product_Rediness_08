# SPEC-32 — CDE Module (ISO 19650 Status Codes + Approval Workflow)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead + Standards lead |
| Phase | Phase 4 (M37–M42) |
| Sprint | S73–S74 |
| References | `12-BIM-2-AND-3-POST-GA-ROADMAP.md` §3; `[strategic ADR-031]`; `[strategic ADR-021]` |

---

## §1 Why this SPEC exists

ISO 19650-2:2018 mandates a Common Data Environment (CDE) as the project information container with auditable status codes (S0–S7) and suitability codes. UK / EU / Singapore / Australia / GSA / USACE / DoD government work requires a CDE *by name* in their RFPs. PRYZM 2 GA at M36 ships `apps/sync-server` as the multi-user collaboration substrate; it is not a CDE. SPEC-32 turns the substrate into a contractually-compliant CDE.

## §2 The contract (binding)

### §2.1 Status state machine

ISO 19650 status codes implemented as an immutable state machine:

| Code | State | Allowed transitions |
|---|---|---|
| S0 | Work In Progress | → S1 (when ready for coordination) |
| S1 | Suitable for Coordination | → S2, → S0 (rework) |
| S2 | Suitable for Information | → S3, → S0 |
| S3 | Suitable for Review and Comment | → S4, → S0 |
| S4 | Suitable for Stage Approval | → S5, → S0 |
| S5 | Suitable for Construction | → S6, → S0 |
| S6 | As Constructed | → S7 |
| S7 | Suitable for Asset Management | terminal |

Suitability codes (independent axis): A1 (issued for acceptance), B1 (partial sign-off with comment), CR1 (comment + revise), etc. Per ISO 19650-2 Table 1.

### §2.2 Approval workflow

Every transition emits a signed `cde_revision` row. Per `[strategic ADR-021]` each issuer has a key pair; signature covers `(projectId, fromState, toState, contentHash, timestamp, issuerId)`. Reviewer comments live in `cde_comments` linked by revision id.

### §2.3 Tables (Postgres)

```sql
cde_states         (project_id, current_state, current_revision_id, updated_at)
cde_revisions      (id, project_id, from_state, to_state, content_hash, issuer_id, signature, created_at)
cde_suitability    (revision_id, code, granted_by, granted_at)
cde_comments       (id, revision_id, element_id NULLABLE, author_id, body, status, created_at)
cde_tags           (id, project_id, revision_id, tag_name, created_at)   -- immutable named releases
cde_releases       (id, project_id, tag_id, signed_zip_hash, created_at) -- pack at point-of-tag
```

### §2.4 Storage topology

Per `[strategic ADR-031]`: **CDE shares the L0 event log** (events + chunks live in the same Postgres + R2 namespace as the active project; revisions are immutable references to event-log positions). Rationale: zero-copy revisions, no double-write cost, single backup story.

## §3 Architecture

```
┌───────────────────────────┐    ┌────────────────────┐
│ apps/cde/ (Express)       │    │ apps/editor/cde/   │
│ - state-machine           │    │ - status badges    │
│ - revision signer         │◄───│ - revision diff    │
│ - comment threads         │    │ - approval flow    │
│ - tag/release             │    │ - reviewer queue   │
└─────────┬─────────────────┘    └────────────────────┘
          │ shares
          ▼
   apps/sync-server (event log + R2)
```

## §4 Sprint rollout

| Sprint | Deliverable |
|---|---|
| S73 D1 | `apps/cde/` skeleton + 6 tables + state machine + ADR-031 ratified |
| S73 D5 | revision signer + signature verification (extends ADR-021 keys) |
| S73 D9 | per-state UI badges in `apps/editor/src/cde/` + S0 → S5 happy path |
| S74 D1 | `cde_comments` + reviewer comment threads + element-anchored comments |
| S74 D5 | `cde_tags` + `cde_releases` + immutable signed-pack export |
| S74 D9 | release-vs-release diff view (re-uses S31 plan-view rendering); CDE bench green |

## §5 NFT targets

| Workload | Target |
|---|---|
| Status transition (single project) | < 10 ms p95 |
| 1,000 status transitions/s sustained | no queue backup |
| 10K-element release diff | < 5 s p95 |
| Comment thread render (100 comments) | < 200 ms p95 |
| Signed-pack export (10K-element project) | < 30 s p95 |

## §6 Anti-patterns forbidden

- Allowing S→S transition skipping (e.g. S0 → S3 direct). Every transition is one step at a time + audit row.
- Mutable revisions. Every revision is content-addressed; "edit" creates a new revision.
- Deleting comments. Comments soft-delete only; original retained for audit.
- Tag re-use. Once a tag exists, it is immutable; new tag = new release.

## §7 Cross-references

- `[strategic ADR-031]` CDE storage topology
- `[strategic ADR-021]` per-issuer signing keys
- SPEC-15 health checks
- SPEC-24 storage map
- SPEC-27 backups + DR
- SPEC-33 stakeholder review consumes CDE
- SPEC-39 EIR/BEP gate enforcement consumes CDE state
