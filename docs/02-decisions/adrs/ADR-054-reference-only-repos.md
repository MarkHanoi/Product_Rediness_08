# ADR-054 — Reference-only repos as gitignored subtrees

| Field | Value |
|---|---|
| Status | **ACCEPTED 2026-06-02** |
| Closes | Cloudflare clone failure caused by orphan submodule pointer at `MasterMiawW/` |
| Owner | Repository hygiene · build & deployment infrastructure |
| Constraint reference | C05 (file format + repo boundary); C00 (docs taxonomy) |
| Touches | `.gitignore` · CI gate `scripts/check/check-orphan-gitlinks.mjs` (PLANNED) |

---

## Context

PRYZM contributors sometimes need to keep a reference codebase available locally for cross-reading patterns into PRYZM packages — e.g. the [`MasterMiawW`](https://github.com/...) Claude-powered chatbot used as a reference for the A.5 RAC chatbot work (see the per-user memory note `mastermiaww-rac-chatbot-reference`).

The well-meaning pattern used so far was: clone the reference repo as a folder inside the PRYZM worktree (`./MasterMiawW/`). That makes it convenient — one folder tree to navigate; the reference is alongside the code that uses it.

But the way git treats a nested `.git/` directory at a tracked path creates a **gitlink** (mode `160000`) in the parent tree. Without an accompanying `.gitmodules` entry, the gitlink is a hanging pointer: git knows there's a submodule "here" but doesn't know where to clone it from.

Local checkouts mask the problem (the folder is physically present so reads work). CI environments hit it hard:

```
fatal: No url found for submodule path 'MasterMiawW' in .gitmodules
Failed: error occurred while updating repository submodules
```

This blocked the first Cloudflare Pages deploy of `pryzm.so`. The hotfix (commit `5feb1d7`) was `git rm --cached MasterMiawW` + add to `.gitignore`. But the underlying pattern — "I want a reference repo alongside the code" — is recurring and needs a policy, not a one-off rm.

---

## Decision

### §1 — Reference-only repos are gitignored

A "reference-only repo" is a checkout the PRYZM worktree contains for development convenience but which:
- Is NOT imported by any PRYZM package, plugin, or app (`packages/*`, `plugins/*`, `apps/*`, `tools/*`)
- Is NOT a build-time dependency
- Is NOT a test fixture
- Has its own remote + its own commit history

Such repos MUST be gitignored at the path they're checked out at:

```gitignore
# .gitignore
MasterMiawW/
SomeOtherReferenceRepo/
```

Adding to `.gitignore` is sufficient + required. They do NOT become git submodules (which would require a `.gitmodules` entry + a real "we promise to keep this URL stable" commitment).

### §2 — Forbidden: gitlinks without `.gitmodules`

The combination "tree-object at mode `160000` + missing `.gitmodules` entry" is a CI failure. This is what bit us today. The fix is structural: no path in the repo MAY be a gitlink unless `.gitmodules` resolves it. A future CI gate `scripts/check/check-orphan-gitlinks.mjs` (queued for the same build-infrastructure batch as the lockfile-drift gate per [ADR-053](./ADR-053-lockfile-drift-policy.md)) will enforce this:

```bash
# Pseudo-code for the gate:
gitlinks=$(git ls-tree HEAD | awk '$2=="commit" {print $4}')
for path in $gitlinks; do
  grep "path = $path" .gitmodules || fail
done
```

If the gate finds any orphan, the PR fails with a message pointing to this ADR.

### §3 — When to use a real submodule (the carve-out)

A real submodule (gitlink **with** `.gitmodules`) is justified when:
- The referenced repo IS a build-time dependency
- AND we control / co-own the referenced repo (so the URL is stable)
- AND it cannot be expressed as an npm/pnpm workspace dep or a published package

These criteria are restrictive on purpose. None of PRYZM's current reference repos meet them. If one ever does, the addition requires:
1. A new ADR superseding §1 for that specific repo
2. A `.gitmodules` entry committed in the same PR as the gitlink
3. Updated CI gates to honour the new path

Reference-only repos that DO NOT meet these criteria continue to use §1's gitignore pattern.

### §4 — How a contributor adds a new reference repo

```bash
# 1. Clone the reference repo INSIDE the PRYZM worktree at the desired path
cd /path/to/Product_Rediness_08
git clone https://github.com/some-org/some-reference-repo

# 2. Add it to .gitignore in the SAME PR you're using it
echo "some-reference-repo/" >> .gitignore
git add .gitignore
git commit -m "chore: add some-reference-repo as gitignored reference checkout"

# 3. Document it in a memory note (per-user) or in docs/05-guides/references/ if team-wide
```

If the contributor forgets step 2 and does `git add -A`, git creates a gitlink at the path. The CI gate (§2) will fail their PR with a clear message.

### §5 — Migration of existing reference repos

The PRYZM repo as of 2026-06-02 contains exactly one reference repo: `MasterMiawW/` (see memory note `mastermiaww-rac-chatbot-reference`). It's already gitignored as of commit `5feb1d7` on the feature branch + `d18db09` on `main`. No other migration needed.

---

## Consequences

### Positive

1. **Clear policy contributors can follow**: one paragraph in §4 answers "how do I add a reference repo without breaking the build".
2. **CI catches recurrences**: the orphan-gitlink gate (§2) means we never re-introduce the failure mode.
3. **Cleaner separation of concerns**: code-in-the-repo is what we own; reference repos are local-checkout-only.
4. **Lower friction for contributors**: no need to remember to commit the reference repo into git; gitignore handles it.

### Negative

1. **Reference repos must be re-cloned by every contributor**: they're not in the main checkout. Mitigated by §4's clear pattern + per-user memory notes describing what's needed.
2. **CI gate not yet implemented**: the §2 check is queued. Until it ships, contributor discipline is the only protection. This ADR documents the intent; the script lands with the lockfile-drift gate.

---

## Related

- **ADR-052** — Docs-site marketing surface (the deploy that surfaced this).
- **ADR-053** — Lockfile-drift policy (same build-infrastructure CI gate batch).
- **C00** — CI gates inventory (this gate gets added).
- Memory note: `mastermiaww-rac-chatbot-reference` (the specific reference repo this ADR was triggered by).

---

## Change log

- **2026-06-02** — Authored after the Cloudflare deploy hit the `MasterMiawW` orphan gitlink. Codifies the pattern that today's hotfix (`5feb1d7` + `d18db09`) put in place.
