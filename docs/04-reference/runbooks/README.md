# Operational runbooks

> **Stamp**: 2026-06-02 · **Status**: DRAFT
> **Authority**: [C48 §1.10](../../02-decisions/contracts/C48-BACKUP-AND-DR.md) (DR runbooks) + [C08 §6](../../02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md) (security runbooks).
> **Tracker**: A.35 (Phase A · Sprint 10) — per-failure-mode runbooks.

This folder holds every operational runbook the on-call SRE consults during an incident. They are short, opinionated, and procedure-first — they tell you what to type, not how to think.

## Index

### Disaster Recovery (C48)

| Failure mode | Runbook | SLA |
|---|---|---|
| Postgres primary unreachable | [RUNBOOK-DB-PRIMARY-FAILURE.md](RUNBOOK-DB-PRIMARY-FAILURE.md) | 30 min |
| Full region outage | [RUNBOOK-REGIONAL-OUTAGE.md](RUNBOOK-REGIONAL-OUTAGE.md) | 4 h |
| Ransomware / encrypted payload | [RUNBOOK-RANSOMWARE.md](RUNBOOK-RANSOMWARE.md) | 24 h |
| Accidental project / data delete | [RUNBOOK-ACCIDENTAL-DELETE.md](RUNBOOK-ACCIDENTAL-DELETE.md) | 30 min – 48 h |

### Drill + retrospective

| Topic | Runbook |
|---|---|
| Quarterly DR drill procedure | [DR-DRILL-RUNBOOK.md](DR-DRILL-RUNBOOK.md) |

## Failure modes NOT YET COVERED

Per [C48 §1.10](../../02-decisions/contracts/C48-BACKUP-AND-DR.md), the following failure modes need runbooks too. They are tracked under A.35 follow-on slices and added as the operational footprint grows:

- Malicious insider access → revoke + audit + restore affected projects (queued for A.35.b)
- Plugin data corruption → uninstall plugin + restore plugin data (queued for A.35.c, deps on C47)
- Migration failure → restore pre-migration original (partial coverage in DR-DRILL-RUNBOOK §3)
- CRDT divergence → restore last successful snapshot of CRDT state (queued for A.35.d)

## Conventions

- One runbook file per failure mode. Index lives in this README.
- Each runbook has the same skeleton: §1 when-it-applies / §2 symptoms / §3 procedure / §4 verification (SLA) / §5 post-incident review / §6 related / §7 drill cadence.
- Procedures use copy-paste-able commands when possible. Where placeholders are needed they're CAPS_SNAKE so they grep clean (`$PG_PRIMARY_HOST`, not `<hostname>`).
- The first three sections fit on one screen. If you can't fit them on one screen, the runbook is too verbose — collapse.
- The drill cadence section is mandatory: every runbook MUST say when it gets exercised. Untested runbooks decay.

## How to add a new runbook

1. Copy the skeleton from any existing runbook
2. Name it `RUNBOOK-<HYPHENATED-MODE>.md`
3. Add an entry to the table above
4. Pick a quarterly drill slot in §7 (don't add a runbook that's never exercised)
5. Open a PR against this folder + tag the ops lead

## Incident archive

Past-incident retrospectives live at `docs/04-reference/runbooks/incidents/YYYY-MM-DD-<slug>.md`. Each runbook's §5 template points at this folder. Incidents stay searchable to inform future drill priorities.
