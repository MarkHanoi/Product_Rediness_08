# PRYZM — Documentation

> **Stamp**: 2026-07-16 · **Status**: CANONICAL (top-level navigation) · _counts + links refreshed 2026-07-16_
>
> Pattern: how Stripe / Linear / Autodesk / Forma organise internal engineering knowledge.

This is the **engineering documentation** root for PRYZM. End-user product docs live in [apps/docs-site/](../apps/docs-site/) (Astro Starlight).

---

## §1 — The mental model (3-layer pyramid + working material)

```
                ┌────────────────────────────────┐
                │       STRATEGY LAYER            │   01-strategy/
                │  Vision · north star · diff      │
                │  Rarely changes. Leadership.     │
                │  → why are we building this?     │
                └─────────────┬──────────────────┘
                              │
                ┌─────────────▼──────────────────┐
                │       DECISION LAYER            │   02-decisions/
                │  Contracts · ADRs · Principles   │
                │  Numbered. Timestamped.          │
                │  Immutable — supersede with new. │
                │  → what choices bind downstream? │
                └─────────────┬──────────────────┘
                              │
                ┌─────────────▼──────────────────┐
                │      EXECUTION LAYER            │   03-execution/
                │  Specs · plans · status          │
                │  One spec per capability area.   │
                │  Status-tracked. Frequently      │
                │  updated. Points up to contracts.│
                │  → how exactly does X get built? │
                └────────────────────────────────┘

         Working material (not in the pyramid)
         ─────────────────────────────────────
         · 04-reference/  — lookup material (API, glossary, file formats, architecture detail)
         · 05-guides/     — audience-specific guides (user / developer / enterprise / plugin-author)
         · archive/       — superseded · historical · pryzm1+pryzm2 inheritance
```

## §2 — Top-level folder map

| Folder | Owns | Cadence | Audience |
|---|---|---|---|
| [01-strategy/](./01-strategy/) | Product vision · engineering vision · system architecture · business strategy | Quarterly+ | Leadership · architects |
| [02-decisions/](./02-decisions/) | Contracts (**C01–C56**, 57 files) · ADRs (**196**) · Principles (P1–P8) | Per-decision; immutable once written | Engineers · reviewers |
| [03-execution/](./03-execution/) | Specs (**~82**) · plans · status · analysis · queue · spikes | Daily–weekly | Engineers · PMs |
| [04-reference/](./04-reference/) | **V1-launch tracker** (readiness audit + implementation plan) · file-formats · architecture-detail · observability · runbooks · security · glossary | Per-release + live launch tracking | Engineers · plugin authors |
| [05-guides/](./05-guides/) | User · developer · enterprise · plugin-author guides | Per-feature | End users · onboarding |
| [interview/](./interview/) | Interview-prep working material (Morfis / three.js / kernels / drills) — **not** part of the canonical pyramid | Ad-hoc | Personal |
| [archive/](./archive/) | PRYZM 1+2 inheritance · superseded plans · dead audits | One-way only | Historical reference |

## §3 — Authority hierarchy (conflict resolution)

Strongest → weakest. When two docs disagree, the higher-authority doc wins:

1. [01-strategy/STR-02-product-vision.md](./01-strategy/STR-02-product-vision.md) — product + business vision
2. [01-strategy/STR-03-engineering-vision.md](./01-strategy/STR-03-engineering-vision.md) — P1–P8 principles + D1–D13 differentiators
3. [01-strategy/STR-04-architecture.md](./01-strategy/STR-04-architecture.md) — system shape + lint gates + convergence booleans
4. [02-decisions/contracts/](./02-decisions/contracts/) — C00–C30 binding contracts
5. [02-decisions/adrs/](./02-decisions/adrs/) — per-decision rationale
6. [03-execution/specs/](./03-execution/specs/) — per-system normative specs
7. [03-execution/plans/](./03-execution/plans/) — sprint plans + roadmaps (descriptive, not binding)

If code disagrees with a contract, **the code is wrong** — fix it or raise an ADR that supersedes the contract.

## §4 — How to add a new document

| If you're writing… | …it goes in |
|---|---|
| A new product/business decision (pricing tier, region) | `01-strategy/` (require leadership sign-off) |
| A new binding rule that downstream code must obey | `02-decisions/contracts/CNN-*.md` (numbered; immutable once merged) |
| A per-decision rationale for *why* a contract clause is what it is | `02-decisions/adrs/ADR-NNN-*.md` (numbered; never edit; supersede instead) |
| A normative spec for a single capability (e.g. PDF export, sync CRDT) | `03-execution/specs/SPEC-NN-*.md` |
| An implementation plan / roadmap / tier table | `03-execution/plans/` |
| A live status snapshot (what's done, what's in flight) | `03-execution/status/` |
| An end-user how-to (architect using PRYZM) | `05-guides/user/` |
| An internal-engineer how-to (how to add a command) | `05-guides/developer/` |
| An audit / review / exploration (working material) | `archive/` or temporarily a `RESEARCH/` subfolder; promote to spec if it lands |
| A historical record of something superseded | `archive/<topic>/<date>/` |

**Never** write `*-AUDIT-YYYY-MM-DD.md` alongside a canonical doc. Edit the canonical doc + record the change in an ADR if it's binding.

## §5 — Quick links

- **New here? Read [in this order](./01-strategy/README.md#§5-—-where-to-look-first)**.
- **Index of contracts**: [02-decisions/contracts/README.md](./02-decisions/contracts/README.md) (C00-INDEX)
- **Index of ADRs**: [02-decisions/adrs/README.md](./02-decisions/adrs/README.md)
- **Index of specs**: [03-execution/specs/README.md](./03-execution/specs/README.md)
- **Master execution tracker**: [03-execution/plans/master-execution-tracker.md](./03-execution/plans/master-execution-tracker.md)
- **V1 launch readiness audit** (live bug/issue log, L-NNN — the active tracker): [04-reference/ISSUE-LOG.md](./04-reference/ISSUE-LOG.md)
- **V1 launch implementation plan** (phased fixes per L-NNN): [04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md](./04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md)
- **Autonomous-session runs log**: [03-execution/status/autonomous-session-runs-log.md](./03-execution/status/autonomous-session-runs-log.md)
- **Naming conventions** (binding for every doc + code identifier): [NAMING-CONVENTIONS.md](./NAMING-CONVENTIONS.md)
- **Documentation authoring contract** (anatomy + immutability + style): [02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md](./02-decisions/contracts/C31-DOCUMENTATION-AUTHORING-PROTOCOL.md)
- **Documentation gaps + 26-session plan to "enterprise-grade"**: [DOCUMENTATION-GAPS-AND-NEXT-PHASES.md](./DOCUMENTATION-GAPS-AND-NEXT-PHASES.md)
- **Missing contracts audit** (18 contract gaps · 4 priority phases): 02-decisions/MISSING-CONTRACTS-AUDIT-2026-06-01.md (audit removed 2026-08-09 — recoverable from git history)

## §6 — Migration note (2026-06-01)

This folder structure was introduced 2026-06-01, replacing the prior topic-organised legacy layout (a `00_Contracts/` dir + a `03_PRYZM3/` umbrella + 14 ad-hoc topic dirs at the docs root). The new structure is **document-type + audience oriented**, mirroring how leading enterprise AEC / SaaS platforms (Autodesk Forma, Stripe, Linear) organise their internal knowledge.

The migration ran in 3 phases:

- **Phase 1** (this commit) — top-level canonical docs (vision · architecture · contracts · master plans · live status) moved to the 3-layer pyramid. Cross-references updated.
- **Phase 2** (follow-on) — reference/ADRs/specs/architecture-detail moved under their pyramid layers.
- **Phase 3** (follow-on) — topic-dirs (architecture/ Analysis/ EdgesLines/ marketing/ mobile/ post-mortems/ retros/ etc.) audited → reference/ or archive/.

The full before/after path mapping (`MIGRATION-FILE-MAP.md`) was a transient migration artifact and is no longer kept at the docs root.

**Migration status (2026-07-16):** Phases 1–3 complete. The former `03_PRYZM3/` working area was folded into the pyramid on 2026-07-16 — its 11 files moved to `03-execution/specs/` (SPEC-CIRCULATION-GRAPH, SPEC-3D-ANALYTICS-FIXES-AND-OVERLAYS), `03-execution/plans/` (climate/GIS/microclimate), `03-execution/analysis/` (execution-engine render-defects audit), `03-execution/spikes/` (balcony · corridor-spine · roof-garden · true-north), and `04-reference/` (PRYZM-3D-GEOSPATIAL-CAPABILITIES) — and the empty directory was removed. The only working area still outside the canonical pyramid is [`interview/`](./interview/) (personal interview-prep material, out of engineering-docs scope). Note also that CLAUDE.md still points the conflict-resolution order at the pre-migration paths (`docs/03_PRYZM3/01-VISION.md` → `02-ARCHITECTURE.md`); those now live at [`01-strategy/`](./01-strategy/) (`STR-02-product-vision.md` → `STR-03-engineering-vision.md` → `STR-04-architecture.md`) per §3 above.
