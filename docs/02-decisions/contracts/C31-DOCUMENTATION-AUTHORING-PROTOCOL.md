# C31 — Documentation Authoring Protocol

> **Stamp**: 2026-06-01 · **Status**: DRAFT (awaits ratification)
> **Scope**: how every document in `docs/` is written, named, structured, versioned, and superseded. The companion to [NAMING-CONVENTIONS.md](../../NAMING-CONVENTIONS.md) — that doc defines the **what**, this contract defines the **must**.
> **Depends on**: [C00 Index](./README.md) · [C01 Architecture & Governance](./C01-ARCHITECTURE-AND-GOVERNANCE.md)
> **Downstream**: every doc author. The 11 doc-CI-gates from [DOCUMENTATION-GAPS-AND-NEXT-PHASES.md §7](../../DOCUMENTATION-GAPS-AND-NEXT-PHASES.md) enforce this contract.
> **Authority**: this contract is binding on every PR that touches `docs/`. Violations block merge.

---

## §1 — Invariants

### §1.1 — Three-layer pyramid governs structure

Every doc lives in exactly one of:

| Layer | Folder | Cadence |
|---|---|---|
| Strategy (WHY) | `docs/01-strategy/` | Quarterly+ |
| Decisions (WHAT BINDS) | `docs/02-decisions/contracts/`, `docs/02-decisions/adrs/`, `docs/02-decisions/principles/` | Per-decision; immutable once merged |
| Execution (HOW) | `docs/03-execution/specs/`, `docs/03-execution/plans/`, `docs/03-execution/status/` | Daily-weekly |

Plus working material:
- `docs/04-reference/` — lookup
- `docs/05-guides/` — audience-specific
- `docs/archive/` — one-way road

A doc that fits NONE of these categories does not get written. Open an ADR if the category needs to expand.

### §1.2 — Naming convention is enforced per document kind

| Kind | Filename pattern | Example |
|---|---|---|
| Top-level navigation README | `README.md` (in every folder) | `docs/01-strategy/README.md` |
| Contract | `CNN-<UPPERCASE-HYPHENATED-TITLE>.md` | `C03-SCHEMAS-COMMANDS-AND-STATE.md` |
| ADR (new — 2026-06-01+) | `ADR-NNNN-<lowercase-kebab-slug>.md` starting at NNNN ≥ 0100 | `ADR-0100-docs-restructure.md` |
| ADR (legacy sprint) | `NNNN-<lowercase-kebab-slug>.md` (sealed — no new files in this format) | `0001-typed-id-brand-strategy.md` |
| ADR (legacy strategic) | `ADR-NNN-<lowercase-kebab-slug>.md` (sealed — no new files in this format) | `ADR-014-l7-5-promotion.md` |
| Spec (numbered) | `SPEC-NN-<UPPERCASE-HYPHENATED-TITLE>.md` | `SPEC-01-GEOMETRY-KERNEL.md` |
| Spec (special-named) | `SPEC-<UPPERCASE-HYPHENATED-TOPIC>.md` | `SPEC-APARTMENT-LAYOUT-GENERATOR.md` |
| Plan | `<lowercase-kebab-topic>.md` (no number, no date) | `master-implementation-plan.md` |
| Status (live tracker) | `<lowercase-kebab-name>.md` (stable filename; date stamps inside) | `autonomous-session-runs-log.md` |
| Status (dated snapshot) | `<lowercase-kebab-topic>-YYYY-MM-DD.md` (sealed at the stamp) | `prior-art-audit-2026-05-31.md` |
| Reference | `<lowercase-kebab-topic>.md` | `glossary.md` · `pryzm-binary.md` |
| Guide | `<lowercase-kebab-topic>.md` in audience subfolder | `user/apartment-layout.md` |

CI gate: `tools/ga-gate/check-doc-naming.ts` (planned) enforces these patterns.

### §1.3 — Every doc has a stamped header

Top of every doc (after H1 title + blank line):

```markdown
# <Title>

> **Stamp**: YYYY-MM-DD · **Status**: <DRAFT | CANONICAL | ACTIVE | SUPERSEDED | HISTORICAL>
> **Scope**: one-sentence summary (≤ 200 chars)
> **Depends on**: (optional) other docs this doc relies on
> **Supersedes**: (optional) prior doc filename if applicable
> **Owner**: (optional) team or person
```

For STATUS docs that bump:

```markdown
> **Stamp**: YYYY-MM-DD (refresh N) · **Status**: LIVE
```

For SUPERSEDED docs (the ONLY allowed edit to a sealed doc):

```markdown
> **Stamp**: YYYY-MM-DD · **Status**: SUPERSEDED by <new doc filename>
```

CI gate: `check-doc-stamps.ts` (planned).

### §1.4 — Immutability — sealed docs

These doc kinds are **sealed once merged** — editing the body is forbidden:

- Contracts (`CNN-*.md`) — except `Status:` line annotation
- ADRs (`ADR-NNNN-*.md` or `NNNN-*.md`) — except `Status:` line annotation
- Dated snapshots (`*-YYYY-MM-DD.md`) — the snapshot is the truth as of the date; never edited

To change a sealed doc: write a NEW numbered doc that supersedes it. The old doc gets one allowed edit: the `Status: SUPERSEDED by …` annotation.

CI gates: `check-adr-immutability.ts` · `check-contract-immutability.ts` · `check-snapshot-immutability.ts` (all planned).

### §1.5 — Authority hierarchy is honoured

When two docs disagree, the higher-authority doc wins (per [`docs/README.md §3`](../../README.md)):

1. `01-strategy/product-vision.md`
2. `01-strategy/engineering-vision.md`
3. `01-strategy/architecture.md`
4. `02-decisions/contracts/CNN-*.md`
5. `02-decisions/adrs/ADR-*.md`
6. `03-execution/specs/SPEC-*.md`
7. `03-execution/plans/*.md`
8. `03-execution/status/*.md`

A doc lower in the order may NEVER contradict a doc higher in the order. If a contradiction is found, the lower doc is wrong — fix it or raise a contract amendment.

### §1.6 — Cross-references use relative paths

Inline link: `[label](relative/path/file.md)` or `[label](relative/path/file.md#section-anchor)`.

- Always relative within `docs/`. Never absolute. Never repo URLs for in-doc links.
- Forward-slash separator (even on Windows).
- Section anchors use the `#§N-—-title` form generated by GitHub markdown rendering.

CI gate: `check-docs-links.ts` (planned) — every relative link in `docs/` must resolve.

### §1.7 — One topic per file

A doc covers exactly one topic. If a draft sprawls past 800 lines it gets split. The first H1 names the topic; every H2 (`## §N — …`) develops it.

### §1.8 — Sections are numbered + labelled

Section heading format:

```markdown
## §1 — <Title>
## §2 — <Title>
```

Substantive H3 uses the same scheme:

```markdown
### §1.1 — <Title>
### §1.2 — <Title>
```

This makes citation precise: "C03 §2.4" is unambiguous.

### §1.9 — Code identifiers are backticked

```markdown
The `composeRuntime()` function in `packages/runtime-composer/` returns a typed `PryzmRuntime`.
```

Never plain prose for code identifiers — backticks always.

### §1.10 — RFC 2119 in normative docs

Contracts and specs use RFC 2119 normative terms: **MUST**, **MUST NOT**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **MAY**. Bolded in body text.

Plans, status, guides — natural English. Don't bold MUST in a status doc; it confuses the reader.

### §1.11 — Brand is PRYZM, not PRYZM 3

Per [NAMING-CONVENTIONS.md §1](../../NAMING-CONVENTIONS.md):

- User-facing docs (guides, marketing, marketplace): say **PRYZM**.
- Engineering docs (contracts, ADRs, specs): say **PRYZM** in the product context; may say "the 2026 architecture" or "epoch 3 architecture" when historical context is the point.

CI gate: `check-pryzm-brand.ts` (planned) — flags `PRYZM 3` / `PRYZM3` / `pryzm3` in `05-guides/` and `apps/docs-site/`.

### §1.12 — Every public function has documentation

Per [P8](../../01-strategy/engineering-vision.md) (every public function must add ≥ 1 OpenTelemetry span), this contract adds: every public exported function MUST have a JSDoc comment of at least one line:

```typescript
/** Returns the per-element isolation override map for a given selection. */
export function buildIsolationIntent(...) { … }
```

CI gate: existing `check-spans.ts` extended (planned).

---

## §2 — Document Anatomies

### §2.1 — Contract anatomy

```markdown
# CNN — <Title>

> **Stamp**: YYYY-MM-DD · **Status**: DRAFT | CANONICAL | SUPERSEDED
> **Scope**: <one-sentence>
> **Depends on**: [C0M Title](./C0M-*.md) · [ADR-NNNN](../adrs/NNNN-*.md)
> **Downstream**: who reads this · what code it binds
> **Key principles**: P-N (which engineering principles this contract enforces)

---

## §1 — Invariants
The numbered rules code MUST obey. Each rule has an §N.M id.

## §2 — Schema
Tables of types, fields, defaults if applicable.

## §3 — Stores / API surface
The runtime surface this contract describes.

## §4 — Commands
The command bus surface, per [C03](./C03-...) + [C16](./C16-...).

## §5 — UI
Editor-side surface if applicable.

## §6 — Tests / CI gates
Conformance tests + lint gates.

## §7 — NFT targets
Performance budgets per [C10](./C10-...).

## §8 — Migration plan
For existing code that doesn't conform yet.

## §9 — What is NOT in this contract
Cross-references to sister contracts.
```

### §2.2 — ADR anatomy

```markdown
# ADR-NNNN — <Title>

**Status**: PROPOSED | ACCEPTED | REJECTED | SUPERSEDED by ADR-NNNN
**Date**: YYYY-MM-DD
**Deciders**: <names>
**Supersedes**: (if applicable) ADR-NNNN
**Related contracts**: (if applicable) C03, C11

## Context
What problem are we solving? What forces are at play?

## Decision
What we chose. One paragraph.

## Consequences
What follows — good, bad, trade-offs.

## Alternatives considered
Other options + why we rejected each.
```

### §2.3 — Spec anatomy

```markdown
# SPEC-NN — <Capability>

> **Stamp**: YYYY-MM-DD · **Status**: DRAFT | ACTIVE | SUPERSEDED
> **Depends on**: C03, C11, ADR-NNNN
> **Owner**: <package or team>

## §1 — Scope
What this spec covers / doesn't cover.

## §2 — Invariants
The rules code MUST obey.

## §3 — Schema
Tables, field types, defaults.

## §4 — Algorithm
Step-by-step pseudocode.

## §5 — API surface
Public functions + types.

## §6 — Conformance tests
What the test suite checks.

## §7 — Performance targets
If any.

## §8 — Migration
How to evolve when this spec changes.
```

### §2.4 — Plan anatomy

```markdown
# <Plan title>

> **Stamp**: YYYY-MM-DD · **Status**: ACTIVE | SUPERSEDED | HISTORICAL
> **Scope**: <one-sentence>
> **Owner**: <team>
> **Depends on**: C-contracts + specs this plan rides on

## §1 — Context
Why this plan exists.

## §2 — Tier table
The ordered work breakdown (Tier · Phase · Deliverable · Owner · ETA · Status).

## §3 — Dependencies
External dependencies, blocking items.

## §4 — Open items
Known unknowns.

## §5 — Cross-references
Related contracts + specs + ADRs.
```

### §2.5 — Status anatomy

```markdown
# <Status title>

> **Stamp**: YYYY-MM-DD (refresh N) · **Status**: LIVE | SNAPSHOT
> **Source**: where this status comes from (git log, agent run, manual audit)
> **Refresh cadence**: <daily | weekly | per-event>

## §1 — Summary
The TL;DR for someone catching up.

## §2 — Body
Tables, counts, observations. Anything structured.

## §3 — Open items
What's still in-flight.

## §4 — Trail
Per-event timeline if applicable.
```

### §2.6 — Guide anatomy

```markdown
# <Guide title>

> **Audience**: end user | internal engineer | plugin author | IT admin
> **Prerequisites**: what the reader needs to know already
> **Stamp**: YYYY-MM-DD (if version-specific)

## TL;DR
One paragraph — the result you'll have after reading.

## §1 — Setup
What's needed.

## §2 — Walkthrough
Step-by-step.

## §3 — Common issues
Known traps.

## §4 — Further reading
Cross-links to contracts / specs / API ref.
```

### §2.7 — Reference anatomy

```markdown
# <Reference title>

> **Stamp**: YYYY-MM-DD · **Type**: glossary | API reference | format spec | runbook

## §N — Tables / facts / examples
No narrative. Look-up material only.
```

---

## §3 — Process

### §3.1 — Adding a new doc

1. Pick the right kind (§1.1 categories).
2. Pick the right name (§1.2 patterns).
3. Use the right anatomy (§2).
4. Stamp with date + status (§1.3).
5. Cross-link from the relevant README + (for contracts) C00 index.
6. PR with reviewers per kind:
   - Contract / Principle: 2 architecture-team reviewers + leadership for principles.
   - ADR: 1 architecture-team reviewer.
   - Spec: 1 owner-package reviewer.
   - Plan / Status / Guide / Reference: 1 reviewer.
7. Once merged, sealed kinds become immutable.

### §3.2 — Editing a doc

| Kind | Edit policy |
|---|---|
| Contract (CANONICAL) | Editable in body — but every edit ratchets the `Stamp:` date. If the change is non-trivial, raise an ADR that records the change. |
| Contract (DRAFT) | Freely editable. |
| ADR (ACCEPTED) | NEVER edit body. Only `Status:` annotation. |
| Spec (ACTIVE) | Editable — bump stamp. |
| Plan | Editable — bump stamp. |
| Status (live tracker) | Append-only edits expected. Bump refresh counter. |
| Status (dated snapshot) | NEVER edit. Write a new snapshot. |
| Guide / Reference | Editable. |
| Strategy doc | Editable but: each edit requires architecture-team review. |

### §3.3 — Superseding a doc

```
old doc (sealed) → mark Status: SUPERSEDED by <new>
new doc → cite old in Supersedes: header
both stay in place forever
```

Old docs that are SUPERSEDED don't move to `archive/` immediately — they stay in the same folder so the cross-link from the new doc resolves. After 90 days OR when the supersession is no longer load-bearing, move to `archive/`.

### §3.4 — Archiving a doc

Move to `archive/<topic>/<doc>.md`. The archived doc is sealed forever. Update any pointing docs to point at the archive path.

CI gate: `check-archive-immutability.ts` (planned) — fails any PR that modifies files inside `archive/`.

---

## §4 — Quality bars

### §4.1 — Every contract has

- A C-number (CNN).
- A clear scope statement (one paragraph).
- A §1 Invariants section (the binding rules).
- At least one cross-reference to another contract or principle.
- A §N What is NOT in this contract section (boundary clarity).

### §4.2 — Every ADR has

- A four-section structure (Context / Decision / Consequences / Alternatives).
- An explicit Status.
- A Decision section that is one paragraph maximum (decisions are crisp).

### §4.3 — Every spec has

- A wire-format or schema table (no spec without a table).
- A conformance-test section listing what the suite checks.
- A performance target if performance is at stake.

### §4.4 — Every guide has

- A TL;DR.
- A worked example.
- Cross-references at the bottom.

### §4.5 — Every README has

- A folder-purpose paragraph.
- An index of what's inside.
- A "what does NOT belong here" section.

---

## §5 — CI gates (planned)

| Gate | What it checks | When it ratchets to hard-fail |
|---|---|---|
| `check-doc-links.ts` | Every relative link resolves | At Phase 4.2 completion |
| `check-doc-naming.ts` | Filenames match §1.2 patterns | Phase 5 |
| `check-doc-stamps.ts` | Every canonical doc has a `Stamp:` header | Phase 5 |
| `check-contract-numbering.ts` | C-numbers monotonic, no dup | Now (low cost) |
| `check-spec-numbering.ts` | SPEC-numbers monotonic | Now |
| `check-adr-immutability.ts` | RATIFIED ADRs only allow Status-line edits | Phase 5 |
| `check-contract-immutability.ts` | RATIFIED contract bodies only allow `Stamp:` update + content delta with reviewer cap | Phase 5 |
| `check-snapshot-immutability.ts` | Dated snapshots are never edited | Phase 5 |
| `check-readme-coverage.ts` | Every `packages/*/`, `plugins/*/`, `apps/*/` has a README | Phase 5 |
| `check-pryzm-brand.ts` | No "PRYZM 3" in user-facing docs | Phase 5 |
| `check-archive-immutability.ts` | `archive/` is one-way | Phase 5 |

---

## §6 — What is NOT in this contract

- **Content rules per subsystem** — those are the subsystem's own contracts (C02–C30).
- **Code conventions** (PascalCase, camelCase) — see [NAMING-CONVENTIONS.md §3](../../NAMING-CONVENTIONS.md).
- **Brand decisions** — see [NAMING-CONVENTIONS.md §1](../../NAMING-CONVENTIONS.md).
- **Commit-message format** — see [NAMING-CONVENTIONS.md §8](../../NAMING-CONVENTIONS.md).
- **Public API documentation** — see [apps/docs-site/](../../../apps/docs-site/) for the public-facing surface.

---

## §7 — Migration plan

Existing docs that don't conform (most pre-2026-06-01 docs) are grandfathered:

| Doc kind | Action |
|---|---|
| Contracts (existing C01–C30) | No rename. Add missing §N What is NOT in this contract section if absent (one PR per contract). |
| ADRs (existing 0001-* and ADR-NNN-*) | No rename. New ADRs use `ADR-NNNN-<slug>.md`. |
| Specs (existing SPEC-01..47 + special-named) | No rename. New specs use the §1.2 patterns. |
| Plans + Status (existing) | No rename. Apply the new anatomy on next major refresh of each doc. |
| Guides + Reference | Apply the new anatomy on next edit. |

CI gates ratchet on the timeline in §5. Until they ratchet to hard-fail, violations are soft-fail counters; new docs MUST conform from day one.
