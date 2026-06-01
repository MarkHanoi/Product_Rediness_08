# PRYZM — Naming Conventions

> **Stamp**: 2026-06-01 · **Status**: CANONICAL
>
> The single source of truth for how things are named across PRYZM — files, contracts, ADRs, specs, tiers, identifiers, brand.

## §1 — Brand

### §1.1 — The product name is **PRYZM**

Not "PRYZM 3". Not "PRYZM 2". Not "PRYZM3".

**Just PRYZM.**

The product has never publicly launched. Previous internal builds ("PRYZM 1", "PRYZM 2") were strangler-fig phases that informed the current architecture, but they aren't releases — they're engineering archeology. Calling today's codebase "PRYZM 3" creates the false impression that two versions shipped before this one. They didn't.

**Public communication** (marketing, marketplace, docs-site, user guides, blog posts, press) MUST say "PRYZM".

**Internal engineering communication** (contracts, ADRs, specs, plans) MAY refer to the **architectural epoch** as "PRYZM 3 architecture" when the historical context (the migration from epoch 2 to epoch 3) is the point being made. In that case, write `the current architecture (epoch 3)` or `the 2026 architecture` rather than `PRYZM 3` standalone.

### §1.2 — Code identifiers

Existing code identifiers (`@pryzm/sdk`, `@pryzm/ai-host`, `pryzm-cli`, etc.) are stable — they have no version suffix in their name. They stay as-is forever. Don't add `@pryzm3/*` ever.

### §1.3 — Repo + tooling

- npm scope: `@pryzm/*` (never `@pryzm3/*`)
- Domain: `pryzm.so` (current) / `pryzm.app` (marketplace)
- File format: `.pryzm` (project file) · `.pryzm-family` (family package)
- CLI: `pryzm` (`apps/cli/`)
- SDK: `@pryzm/sdk`

### §1.4 — Migration of legacy "PRYZM 3" references

The codebase has ~3000 references to "PRYZM 3" / "PRYZM3" / "pryzm3" across docs and code. The migration to "PRYZM only" is a **separate sweep** (queued in [DOCUMENTATION-GAPS-AND-NEXT-PHASES.md](./DOCUMENTATION-GAPS-AND-NEXT-PHASES.md)). Rules for the sweep:

| Old | New | Notes |
|---|---|---|
| `PRYZM 3` (product name) | `PRYZM` | sweep all docs/, marketing/, user-facing |
| `pryzm3-internal/` (archive folder) | unchanged | this folder IS the archeology — keep its name |
| `PRYZM 3 architecture` (epoch) | `the 2026 architecture` OR `epoch 3 architecture` | when historical context matters |
| `@pryzm3/*` (code id) | n/a — never existed | confirm there are zero of these |
| `pryzm-3-convergence-plan` (filename) | unchanged | historical artefact in archive |
| `[PRYZM 3] (...)` in commit titles | drop the prefix | new commits |

## §2 — Document identifiers

### §2.1 — Contracts

| Format | Example | Authority |
|---|---|---|
| `CNN-<HYPHENATED-TITLE>.md` | `C03-SCHEMAS-COMMANDS-AND-STATE.md` | uppercase title, kebab-separated |
| `README.md` | The contracts/README.md is the C00 index | special-case |

- Numbering is monotonic 01–99. Currently used: C00–C18, C24–C30. Gaps (C19–C23) are reserved; do not fill ad-hoc.
- Title is UPPERCASE-HYPHENATED in the filename so they sort + grep cleanly.
- Once RATIFIED, the filename is sealed. Don't rename.

### §2.2 — ADRs

| Format | Example | Era |
|---|---|---|
| `NNNN-<lowercase-slug>.md` | `0001-typed-id-brand-strategy.md` | code-level (4-digit, 0001–0099+) |
| `ADR-NNN-<lowercase-slug>.md` | `ADR-014-l7-5-promotion.md` | strategic (3-digit, 001–099+) |

Going forward (2026-06-01+), use the **4-digit `NNNN-*.md`** format starting at the next free number above both series.

### §2.3 — Specs

| Format | Example |
|---|---|
| `SPEC-NN-<UPPERCASE-HYPHENATED-TITLE>.md` | `SPEC-01-GEOMETRY-KERNEL.md` |
| `SPEC-<TOPIC-UPPERCASE-HYPHENATED>.md` | `SPEC-APARTMENT-LAYOUT-GENERATOR.md` (special-named, no number) |

Numbered specs are monotonic. Special-named specs are for areas that don't fit a clean numbered sequence.

### §2.4 — Plans

| Format | Example |
|---|---|
| `<topic-kebab-case-lowercase>.md` | `master-implementation-plan.md` · `apartment/furniture-and-activity.md` |

- No number prefix.
- No date in filename (date goes inside the body stamp).
- Topic-scoped.

### §2.5 — Status

| Filename style | When |
|---|---|
| `<live-tracker-name>.md` | Live trackers — date moves inside, filename stable |
| `<topic>-YYYY-MM-DD.md` | Dated milestone audits — sealed at the stamp date |
| `<dashboard-name>.md` | Topic dashboards — replaces in place |

## §3 — Code identifiers (file/package/module)

### §3.1 — Packages + plugins

| Kind | Format | Example |
|---|---|---|
| Package | `@pryzm/<kebab-case>` | `@pryzm/ai-host`, `@pryzm/renderer-three` |
| Plugin | folder under `plugins/`, lowercase kebab | `plugins/wall/`, `plugins/ifc-export/` |
| App | folder under `apps/`, lowercase kebab | `apps/editor/`, `apps/marketplace-web/` |

### §3.2 — TypeScript identifiers

| Kind | Convention | Example |
|---|---|---|
| Class | `PascalCase` | `class IsolationAnimator` |
| Interface | `PascalCase` (no `I` prefix) | `interface IsolationStateProvider` (NOT `IIsolationStateProvider`) |
| Type alias | `PascalCase` | `type IsolationTier` |
| Function | `camelCase` | `function buildIsolationIntent()` |
| Constant | `SCREAMING_SNAKE_CASE` | `const MAX_L6_PER_GROUP = 50` |
| Module-private | `_camelCase` (leading underscore) | `_buildElementType()` (private method on a class is also fine) |
| File | `camelCase.ts` for modules · `PascalCase.ts` for class-exports | `isolationIntent.ts` · `IsolationAnimator.ts` |
| Test file | `<source>.test.ts` | `IsolationAnimator.test.ts` |

### §3.3 — Commands

Per [C16 Command Authoring Protocol](./02-decisions/contracts/C16-COMMAND-AUTHORING-PROTOCOL.md):

- Command type id: `<discipline>.<verb>` lowercase dot-separated. E.g. `wall.create`, `wall.batch.create`, `door.batch.create`, `inspect.selectNode`, `apartment.layout-executed`.
- Command handler class: `PascalCaseHandler`. E.g. `CreateWallHandler`, `CreateDoorHandler`.
- Command DTO: `PascalCasePayload` or `PascalCaseCommand`. E.g. `CreateWallPayload`.

## §4 — Identifier ranges across the apartment plan

The apartment-generation workstream uses several intersecting identifier systems. To avoid collisions:

| Range | Meaning | Example | Authority doc |
|---|---|---|---|
| `P1–P8` | Architectural Principles | "P3 — single rAF" | engineering-vision.md §2 |
| `D1–D13` | Differentiators | "D5 AI as first-class layer" | engineering-vision.md §4 |
| `C01–C30` | Contracts | "C09 AI & Visibility Intent" | contracts/README.md |
| `ADR-NNN` / `NNNN-` | Architecture Decision Records | "ADR-014 L7.5 promotion" | adrs/README.md |
| `SPEC-NN` | Specs | "SPEC-26 .pryzm file format" | specs/README.md |
| `Z.N` | Apartment plan tiers | "Z.10 Tier 9 — Activity Systems" | apartment/furniture-and-activity.md §0.0 |
| **`Cog-LN`** | Apartment cognition stack layers | "Cog-L3 Semantic Topology" | apartment/cognition-stack.md — disambiguated from architectural L0-L9 |
| `F-tier` | Furniture-tier work (`F1.1–F8`) | "F4.1 Media Wall" | apartment/furniture-and-activity.md |
| `D-α-N` / `D-β-N` / `D-γ-N` | BIM 2/3 Live Parametric phases | "D-α-4 Apartment Data Panel" | apartment/bim2-bim3-data-mgmt.md |
| `S1–S7` | Apartment activity systems | "S1 Media Wall, S2 Entry Storage" | apartment/furniture-and-activity.md §2 |
| `G1–G10` | Dimensional G-class validators | "G5 furniture-fit lower bound" | apartment/dimensional-constraints.md |
| `T1–T6` | Topology T-class validators | "T2.5 frontage allocator" | apartment/dimensional-constraints.md |
| `PG0.N` | Geospatial Foundation platform-level phases | "PG0.3 Cesium ingestion adapter" | plans/geospatial-foundation.md |
| `GS0.N` | Geospatial apartment-consumer phases | "GS0.5 Site-aware FacadeValueField" | plans/geospatial-and-site-intelligence.md |
| `P0.N` | Family Platform strategic phases | "P0.3 FamilyRegistry substrate" | apartment/family-platform.md |
| `S<N>-<verb>` | Sprint identifiers (legacy) | "S37", "S41", "S47" | archived sprint plans |
| `Wave N`, `Wave AN`, `Phase D/E` | PRYZM 3 strangler-fig phases (legacy) | "Wave A20" | archive/pryzm3-internal/ |

**Critical collision**: the legacy docs use `L1`, `L2`, `L3`, etc. for BOTH architectural layers (L0–L9 system layers) AND cognition layers (the 7-layer apartment cognition stack). When writing, **always qualify**:

- "L3 — State" → architectural layer 3 (packages/stores)
- "Cog-L3 — Semantic Topology" → cognition stack layer 3 (EdgeType + bubbleGraph)

Files in `apartment/cognition-stack.md` use the `L1–L7` notation in their own context (cognition); files in `01-strategy/architecture.md` use `L0–L9` for system layers. When citing across domains, prefix.

## §5 — Date stamps

```
> **Stamp**: 2026-06-01
> **Stamp**: 2026-06-01 (refresh 3)
> **Stamp**: 2026-06-01 · **Status**: CANONICAL
```

- ISO 8601 dates always (`YYYY-MM-DD`). Never `06/01/2026` or `1 Jun 2026`.
- Use `refresh N` counter for live-tracker docs that bump dates.
- Stamp is line 3 of the doc (after the H1 title + blank).

## §6 — Body conventions

- **MUST / MUST NOT / SHALL / MAY** — RFC 2119 normative terms in contracts + specs.
- **§N — Title** — section numbering format. Always `§<number> — <title>`.
- **`code`** — backticks for code identifiers, paths, filenames.
- **bold** — for emphasis on a binding rule.
- **`/`** path separator — even on Windows.
- **/docs/foo/bar.md** — links use forward slashes always.

## §7 — Cross-references

Inline: `[label](relative/path/file.md)` or `[label](relative/path/file.md#section-anchor)`.

Always prefer relative paths within `docs/`. Never use absolute paths. Never use repo URLs for in-doc links (those break on rename).

## §8 — Commit messages

```
<scope>: <subject — present tense, ≤72 chars>

<paragraph — what changed and why>

<bullet list — file-level highlights>

Co-Authored-By: <if applicable>
```

- Scope: package or domain — `docs`, `ifc-export`, `editor`, `ai-host`, etc.
- Subject: imperative present — "add", "fix", "rename", "migrate", "ship".
- No "PRYZM 3" / "[PRYZM]" prefix.

## §9 — When to add a new convention

Open a PR against this doc. Require: 2 reviewers from the architecture team. Once merged, the new convention is binding. Backfill existing files in a sweep within 1 sprint.
