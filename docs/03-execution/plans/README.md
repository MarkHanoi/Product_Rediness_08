# Plans — implementation plans + roadmaps

> Sprint plans, roadmaps, tier tables, master plans. Descriptive (not binding).

## §1 — What lives here

Plans **describe how things will be built** over time. They're descriptive — code is bound by [contracts](../../02-decisions/contracts/) and [specs](../specs/), not by plans.

Plans answer: "what's the sequence?" "what depends on what?" "what's the rough timeline?"

## §2 — Top-level plans

| Plan | Purpose |
|---|---|
| [master-implementation-plan.md](./master-implementation-plan.md) | The 2026-05-31 end-to-end synthesis across all C-contracts |
| [master-architecture-and-capabilities.md](./master-architecture-and-capabilities.md) | The 2026-06-01 folder map + capability rollup (this session's audit) |
| [post-ga-roadmap.md](./post-ga-roadmap.md) | Phase F + post-GA roadmap |
| [pryzm-1-sunset.md](./pryzm-1-sunset.md) | PRYZM 1 retirement plan |
| [pryzm-4-next-gen.md](./pryzm-4-next-gen.md) + [pryzm4-readme.md](./pryzm4-readme.md) | Long-horizon PRYZM 4 thinking |
| [geospatial-foundation.md](./geospatial-foundation.md) + [geospatial-and-site-intelligence.md](./geospatial-and-site-intelligence.md) | GS0 / PG0 site context platform |

## §3 — Apartment-generation plans

The biggest in-flight workstream. See [apartment/](./apartment/) for:

| Plan | Purpose |
|---|---|
| [apartment/furniture-and-activity.md](./apartment/furniture-and-activity.md) | The F-tier (F1.1–F8) — furniture catalogue + activity systems |
| [apartment/cognition-stack.md](./apartment/cognition-stack.md) | L1–L7 cognition layers (Environmental → Typology Priors) |
| [apartment/family-platform.md](./apartment/family-platform.md) | P0 Family Platform — user-defined families + plugin marketplace runtime |
| [apartment/dimensional-constraints.md](./apartment/dimensional-constraints.md) | D-class + T-class pre-furnishing validators |
| [apartment/driving-principles.md](./apartment/driving-principles.md) | Room / element / matrix |
| [apartment/bim2-bim3-data-mgmt.md](./apartment/bim2-bim3-data-mgmt.md) | D-α/β/γ live parametric substrate |

## §4 — Launch / marketing plans

See [launch/](./launch/) for go-to-market drafts:

- `ga-launch-blog-post.md`
- `beta-announcement.md`
- `beta-demo-script.md`
- `40-cw-pipeline-trace.md` (historical batch trace, in this folder because it informed the launch narrative)
- `41-batch-errors.md`

## §5 — Legacy plans (pre-2026-04-30)

See [legacy/](./legacy/) for:

- `phases/` — pre-2026 sprint phase plans (PHASE-1, PHASE-2, PHASE-3, PHASE-4-POST-GA)
- `plan-detail/` — fine-grained plan-detail docs
- `wireup-2026/` — the 2026 wireup plan with chunks + reconciliation

These are kept for archeology. They document the path-to-PRYZM-3 work that happened pre-2026-04-30. New plans should NOT reference them as if they were current — they're historical.

## §6 — Authoring conventions

### Filename

- Kebab-case lowercase: `my-new-plan.md`
- No date in filename (stamp the date INSIDE the doc).
- Topic-scoped (NOT date-stamped) — the same plan evolves; the date stamp moves; the filename stays.

### Header

```markdown
# <Plan title>

> **Stamp**: YYYY-MM-DD · **Status**: ACTIVE | SUPERSEDED | HISTORICAL
> **Scope**: one-sentence summary of what's covered
> **Owner**: <team or person>
> **Depends on**: C-contracts and specs this plan rides on
> **Supersedes**: (if applicable) prior plan filename
```

### Section structure

- §1 — Context / why this plan exists
- §2 — Tier or phase table (the ordered work breakdown)
- §3 — Dependencies
- §4 — Open items / unknowns
- §5 — Cross-references

## §7 — When to write a new plan

You're writing a plan when:

- A roadmap shifts and needs to be re-laid-out.
- A new tier of work emerges that doesn't fit an existing plan.
- A workstream has enough scope that a tracking doc is justified (5+ deliverables).

You're NOT writing a plan when:

- It's a single decision → ADR
- It's a binding rule → contract
- It's an algorithm definition → spec
- It's a status snapshot → `../status/`

## §8 — When to archive a plan

Move to [`../../archive/`](../../archive/) when:

- The plan's deliverables are 100% shipped (move to `archive/closed-plans/<topic>/`).
- The plan was superseded (move to `archive/superseded-plans/<topic>/`).
- The plan was abandoned (move to `archive/abandoned-plans/<topic>/`).
