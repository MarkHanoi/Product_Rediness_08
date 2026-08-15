# `tools/tracker` — commit ledger + gate-staleness for the BIM 3.0 master tracker

> **The requirement**, verbatim: *"every time a file is committed the tracker should be updated."*

This is the mechanism that satisfies it — and, just as importantly, the mechanism that
**refuses** to satisfy it the wrong way.

---

## What it does

On every commit (via `.githooks/post-commit`), it regenerates ONE delimited block inside
`docs/03-execution/plans/BIM30-MASTER-COMPLETION-TRACKER.md`:

```
<!-- TRACKER:AUTO:BEGIN -->
   ... machine-owned. Regenerated in full, every run. ...
<!-- TRACKER:AUTO:END -->
```

The block carries three things:

1. **A commit ledger** — the last N commits (default 25): SHA, date, subject, file count, and
   **which tracker rows own the paths that commit touched**, resolved through the explicit
   mapping in [`row-paths.json`](row-paths.json).
2. **An UNMAPPED section** — every changed path that matched *no* row, bucketed by area with a
   count. See "Honest emptiness" below; this section is the whole point of the design.
3. **A gate-staleness table** — for each gate named in the sidecar, the SHA and date of its last
   recorded measurement and **how many commits have landed since**, so a reader instantly sees
   *"this reading is 246 commits old"* rather than quoting it as current.

---

## What it deliberately does NOT do

### It never changes a row's STATUS. Only an executed gate run may do that.

This is the constraint the whole design is built around. A commit is evidence that **work
happened**; it is not evidence that the work is **correct**. A hook that flipped a row to CLOSED,
or nudged a percentage, because a file under that row was edited would be hand-incrementing a
count from an unmeasured premise — which is the single most frequently logged defect class in
this repo (a document asserting a state that nobody measured). So:

- It writes no `OPEN` / `CLOSED` / `UNPROVEN`.
- It writes no `N of 82`, no `%` complete.
- There is a test that fails if the rendered block ever emits any of those.

### It never runs a gate.

Post-commit hooks that take seconds get uninstalled, and then the mechanism is worth nothing.
The hook counts and discloses; it does not measure. Staleness is derived from **when the gate's
evidence artefact was last committed**, which is one `git log -1 -- <path>` per gate.

### It never fails a commit, and never amends one.

`post-commit` exits 0 unconditionally. The refreshed block is left in the working tree for your
**next** commit — the hook does not stage, commit, or `--amend`. Amending would rewrite the very
SHA the block just recorded (a lie), and in a multi-worktree fleet it is a footgun.

### It never touches prose outside the markers.

Everything before `BEGIN` and after `END` is preserved byte-for-byte; a test asserts exactly
this against a fixture containing the shapes that break naive splicers.

---

## Honest emptiness (§CONTEXT-DATA-HONESTY)

**Failure and emptiness are the same value unless you deliberately separate them.**

- A changed path that maps to no row is **disclosed under UNMAPPED**, never dropped. A dropped
  path would make *"we have not written the mapping yet"* indistinguishable from *"no row was
  affected"*.
- A gate whose evidence artefact does not exist renders **`NOT DETERMINED`** with the reason —
  never `0`, which a reader would take to mean *freshly measured at HEAD*.
- `row-paths.json` ships a gate (`check-relationship-determination`, bar 3) that is **expected to
  read NOT DETERMINED today**, because that gate does not exist yet. It is listed precisely so the
  table cannot quietly imply bar 3 has been measured.

---

## Opt in (one line, per clone)

```bash
git config core.hooksPath .githooks
```

Undo with `git config --unset core.hooksPath`. This is repo-local config, not a committed
setting, so it is opt-in per developer and per worktree.

Run it by hand any time:

```bash
npx tsx tools/tracker/update-tracker.ts
```

### CI

```bash
npx tsx tools/tracker/update-tracker.ts --check   # exit 1 if the block lags HEAD
```

`--check` writes nothing, ever. It exits non-zero if the block is out of date **or** if the
markers are missing/duplicated/inverted.

### Tests

```bash
npx vitest run --config tools/tracker/vitest.config.ts
```

A local config, not the root one: this suite is pure Node with no DOM, and the root
`vitest.config.ts` include list is hand-curated and load-bearing (§L-851).

---

## Adding a row → path mapping

Edit [`row-paths.json`](row-paths.json). Each row:

```jsonc
{
  "id": "GR-07",                       // MUST match the tracker's own row id
  "title": "Short human label",
  "globs": ["packages/foo/**", "apps/editor/src/bar/*.ts"]
}
```

Glob support is deliberately small — `**` (any, including `/`), `*` (any, excluding `/`), `?`
(one, excluding `/`). No braces, no extglob. A path may belong to several rows and is reported
to each.

To age a gate, add to `gates[]` with the artefact a gate **run** writes into:

```jsonc
{ "id": "GR-07", "gate": "check-thing", "evidence": ["tools/ga-gate/thing-baseline.json"] }
```

---

## ⚠ What is still missing — the tracker lane owns this

**`row-paths.json` contains two example rows, not the full set.** They are real and verified, but
the tracker owns ~82 rows and this file maps two of them. Until the rest are added, nearly every
changed path lands under UNMAPPED — which is loud and correct, but not yet useful.

The two shipped ids (`bar-3`, `epsilon-policy`) are **provisional**: `bar-3` is the roadmap's
name (§3.1), not a gap-register row id. The tracker lane must re-key them to the register's real
`GE-01..GE-12` / `GR-01..GR-18` vocabulary and fill in the remainder.

This was left undone on purpose. **An unmapped path is disclosed; a wrong mapping is invisible.**
Guessing eighty mappings here would have produced confident-looking ownership claims nobody
measured — so the mechanism ships with two correct rows and shouts about everything else.

**The tracker file also needs the two markers added** (`<!-- TRACKER:AUTO:BEGIN -->` /
`<!-- TRACKER:AUTO:END -->`, in that order, on their own lines) wherever the auto-block should
live. Until they exist the tool refuses to write and says so — it will not guess a location.
