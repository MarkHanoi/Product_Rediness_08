# archive — HISTORY

> Superseded, frozen, never-deleted. The one-way road.

## §1 — What lives here

Documents that were **once load-bearing but no longer are**. We keep them forever for:

- **Archeology** — "why did we make this decision back then?"
- **Audit trail** — regulatory / compliance trace.
- **Provenance** — explains how today's structure came to be.

Documents in this folder are **not part of the live documentation graph**. They aren't authority sources. They aren't cross-referenced from current docs (except as historical pointers).

## §2 — Top-level folders

| Folder | Origin | Era |
|---|---|---|
| [pryzm3-internal/](./pryzm3-internal/) | The pre-2026-06-01 `docs/03_PRYZM3/archive/` — internal working material from the PRYZM 3 strangler-fig migration (~170 files) | 2024–2026-05 |
| [contracts-superseded-pryzm1-pryzm2/](./contracts-superseded-pryzm1-pryzm2/) | Inherited PRYZM 1 + PRYZM 2 contracts (kept for archeology) | 2023–2024 |
| [DAR/](./DAR/) | Founding-engineer + interview material (CRDT deep-dive, snapshot recovery, REST API, beginners' guides) | 2024 onboarding |
| [Saving/](./Saving/) | Full-save lifecycle + Supabase implementation plan + SAVEProcess.md | 2024–2025 |
| [audit/](./audit/) + [audits/](./audits/) | Older audits — pre-2026-04-30 | 2024–2025 |
| [studies/](./studies/) | One-off design studies | various |
| [topic-dirs/](./topic-dirs/) | Material that came from now-deleted topic dirs at docs root | 2024–2025 |

## §3 — The "one-way road" rule

Once a document lands in archive/, it stays. We **never** promote an archived doc back to a live folder. If we need to bring back ideas:

1. **Cite** the archived doc (don't move it back).
2. **Author a NEW doc** in the appropriate live folder with the citation.
3. The archived doc remains intact.

This protects the historical record. The archive answers "what did we used to believe?"; the live folders answer "what do we believe now?"

## §4 — Searching archives

```bash
# Find every mention of "Pascal" across the archive
grep -rn "Pascal" docs/archive/

# Find every doc dated 2026-05
find docs/archive -name '*2026-05*'

# Find every SUPERSEDED-tagged doc
grep -rn "SUPERSEDED" docs/archive/ | head
```

## §5 — When to archive

- **Plan finished** → `archive/closed-plans/<topic>/<plan>.md`
- **Plan superseded** → `archive/superseded-plans/<topic>/<plan>.md`
- **Plan abandoned** → `archive/abandoned-plans/<topic>/<plan>.md`
- **Doc became stale** (no longer reflects code) and we wrote a replacement → `archive/<original-folder>/<doc>.md`
- **Audit finished + reported** → `archive/audits/<YYYY>/<audit>.md`

## §6 — When to NOT archive

- The doc is **still load-bearing** (someone references it from current code or docs).
- The doc is **superseded but the new doc is missing pieces** the old one had → finish the new doc first.
- The doc is just **stale** — fix it in place; don't archive.

The CI gate (planned) `tools/ga-gate/check-archive-immutability.ts` will fail any PR that modifies files inside `archive/` (except for adding new files to sub-archive paths).
