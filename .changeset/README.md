# Changesets

This folder is consumed by [Changesets](https://github.com/changesets/changesets) to manage version bumps and release notes for every public PRYZM 2 workspace.

It is the **S01-T1** deliverable from `docs/03_PRYZM3/reference/phases/PHASE-1/1A-Q1-M1-M3-SKELETON-RAILS.md` (line 192). At S01 the only required artefact is the directory + `config.json` so future sprints can drop changesets without re-bootstrapping.

## How

1. After making a change to one or more public workspaces, run `npx changeset`.
2. Choose the bump level (`patch` / `minor` / `major`) for each affected package.
3. Write a one-line summary; commit the resulting `.changeset/<random-id>.md` file alongside your change.
4. The release pipeline consumes accumulated changesets and turns them into version bumps + CHANGELOG entries.

## Ignored

Internal-only workspaces (benches, lint-fixture shims, toy plugins, the lint plugin itself) are listed under `ignore[]` in `config.json` because they never publish independently.
