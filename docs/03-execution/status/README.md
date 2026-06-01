# Status — live status snapshots

> Documents that describe **what is actually true today**. Always stamped. Superseded by the next stamp, never edited.

## §1 — What lives here

Live trackers + dated snapshots. Three flavours:

| Flavour | Filename pattern | Cadence | Example |
|---|---|---|---|
| **Live tracker** | stable filename, internal stamp | continuously updated | `autonomous-session-runs-log.md` |
| **Dated snapshot** | `*-YYYY-MM-DD.md` | one-shot at a milestone | `prior-art-audit-2026-05-31.md` |
| **Topic dashboard** | stable filename, replaces in-place | weekly–monthly | `apartment-status-dashboard.md` |

## §2 — Index

### Live trackers (continuously updated)

| File | Owns |
|---|---|
| [autonomous-session-runs-log.md](./autonomous-session-runs-log.md) | Multi-agent autonomous-session record (refresh-3 at 2026-06-01) |
| [apartment-layout-status.md](./apartment-layout-status.md) | Apartment generation tier-table progress |
| [apartment-status-dashboard.md](./apartment-status-dashboard.md) | High-level apartment dashboard |
| [remaining-work-consolidated.md](./remaining-work-consolidated.md) | Open-work rollup across all C-contract subsystems |
| [cut-list-log.md](./cut-list-log.md) | Operational cuts log |
| [senior-architect-audit.md](./senior-architect-audit.md) | Architect's snapshot |

### Dated milestone audits

| File | Stamp |
|---|---|
| [prior-art-audit-2026-05-31.md](./prior-art-audit-2026-05-31.md) | 2026-05-31 — repository state grounding the master plan |

### Topic-specific status

| Folder | Topic |
|---|---|
| [intent-analysis/](./intent-analysis/) | Intent-as-view-properties + UI/UX gaps + user journeys (5 files) |
| [performance-analysis/](./performance-analysis/) | Project-open performance audit + process tracker |
| [edges-lines/](./edges-lines/) | Edge-line flicker + WebGPU overlay depth-bias analysis |
| [post-mortems/](./post-mortems/) | PRYZM-2-build post-mortem |
| [retros/](./retros/) | Phase-1-close retro |
| [sprints/](./sprints/) | S18-retro |
| [legacy-status-detail/](./legacy-status-detail/) | Pre-2026 status snapshots — kept for archeology |

## §3 — Authoring conventions

### Stamp rule

Every status doc carries a date stamp inside the body:

```markdown
> **Stamp**: YYYY-MM-DD (refresh-N) · **Status**: LIVE | SNAPSHOT | SUPERSEDED
```

For live trackers, bump the date + refresh-N counter on each substantive update.
For dated snapshots, the filename carries the date; don't bump it — write a new file if the snapshot needs a new milestone.

### Filename rule

- **Live trackers**: stable filename, NO date in filename. The date moves inside.
- **Dated snapshots**: filename ends `-YYYY-MM-DD.md`. Never edited after the date passes — write a new one.
- **Topic dashboards**: stable filename, replaces in-place. The "as-of" date is inside.

### Never edit a sealed snapshot

A dated snapshot (`prior-art-audit-2026-05-31.md`) is sealed once committed. To update:

1. Write a new snapshot: `prior-art-audit-2026-NN-NN.md`
2. Optionally link the new one from the old one's header (`See newer: …`)
3. Move OLD ones to `archive/` after 90 days

## §4 — Lifecycle

```
DRAFT (uncommitted) → LIVE / SNAPSHOT → SUPERSEDED → archive/
```

When a status doc is SUPERSEDED, move it to `archive/status/<topic>/`. Keep it forever; never delete — git history isn't the same as documentary archive.

## §5 — What does NOT belong here

- **Plans** (what we're going to do) → [`../plans/`](../plans/)
- **Specs** (how things should be built) → [`../specs/`](../specs/)
- **ADRs** (why we chose option B) → [`../../02-decisions/adrs/`](../../02-decisions/adrs/)
- **Marketing copy** → [`../plans/launch/`](../plans/launch/)
- **User-facing how-to** → [`../../05-guides/user/`](../../05-guides/user/)
