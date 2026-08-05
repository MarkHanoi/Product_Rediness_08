# Lint Debt Tracker — 2026-08-05

## Why this exists

`deploy-fly.yml` regained its `push: main` trigger this session (see `git log` commit
`feat(deploy): restore push-to-main auto-deploy`). That trigger gates on `ci.yml`'s
required jobs, one of which is `Lint`. The first push-gated run since §OPTION-A
(2026-07-23 disabled push-deploy) surfaced **395 pre-existing ESLint errors** that were
never actually gating anything — every deploy since July went through manual
`workflow_dispatch`, and most of those used `bypass_ci_gate`.

**None of these 395 errors were introduced by today's commits.** Confirmed by file list —
they sit in `packages/command-registry`, `plugins/wall`, `apps/editor` (pre-existing
files), `packages/core-app-model`, `plugins/annotations`, `tools/ga-gate`,
`packages/file-format`, `tools/spanish-genome-probe`, `packages/renderer-three`,
`apps/api-gateway`, and a long tail of `packages/geometry-*`. Today's deploy
(commit `91b6fe2e`) shipped via an audited `bypass_ci_gate=true` dispatch
(run [30992180106](https://github.com/MarkHanoi/Product_Rediness_08/actions/runs/30992180106))
specifically because paying this down was out of scope for that deploy.

Source log: [run 30991272835, job "Lint"](https://github.com/MarkHanoi/Product_Rediness_08/actions/runs/30991272835/job/92257741286).

## Totals by rule

| Rule | Count | Nature |
|---|---:|---|
| `no-empty` | 156 | Empty block (mostly `catch (_) {}` swallow-patterns) |
| `no-restricted-imports` | 126 | Cross-layer/boundary violations (P2/L7 rules, `express` scope) |
| `no-unused-vars` | 73 | Dead bindings |
| `pryzm/no-three-outside-committer` | 18 | P2 violation — `THREE` imported outside `renderer-three` |
| `no-useless-escape` | 10 | Regex/string escape cleanup |
| `no-irregular-whitespace` | 3 | Stray Unicode whitespace |
| `no-unreachable` | 3 | Dead code after return/throw |
| `no-control-regex` | 2 | Regex with control-char ranges |
| `pryzm/store-single-channel` | 2 | Store-architecture violation |
| `no-misleading-character-class` | 1 | Regex char-class bug |
| `pryzm/affected-stores-required` | 1 | Missing store-touch declaration |

## Totals by directory (top 2 path segments)

| Directory | Count | Dominant rule |
|---|---:|---|
| `packages/command-registry` | 111 | `no-empty` (110) |
| `plugins/wall` | 42 | `no-unused-vars` (37) |
| `apps/editor` | 40 | `no-restricted-imports` (27), `no-empty` (10) |
| `packages/core-app-model` | 26 | `no-restricted-imports` (18) |
| `plugins/annotations` | 24 | `no-restricted-imports` (24) |
| `tools/ga-gate` | 24 | `no-unused-vars` (19) |
| `packages/file-format` | 23 | `no-empty` (19) |
| `tools/spanish-genome-probe` | 18 | `no-unused-vars` (15) |
| `packages/renderer-three` | 14 | `pryzm/no-three-outside-committer` (14) |
| `apps/api-gateway` | 14 | `no-restricted-imports` (14) |
| *(20 more dirs, 1–7 each)* | 59 | mixed |

Full per-file, per-line CSV: `docs/04-reference/lint-debt-2026-08-05.csv` (395 rows —
File, Line, Rule, Msg).

## Triage plan (ordered by leverage, not just size)

1. **`packages/command-registry` `no-empty` (110 errors, 14 files)** — highest single
   leverage. Pattern is `try { ... } catch (_) {}` intentional-swallow blocks (verified
   in `CreateBeamCommand.ts`). Fix is mechanical: either a `// intentionally ignored —
   <reason>` comment inside the block (satisfies `no-empty` with `allowEmptyCatch`-style
   documentation) or a `/* noop */` per project convention — needs one look at how
   other command-registry files already pass this rule, then apply uniformly across 14
   files. **Est. 30–45 min.**
2. **`packages/renderer-three` `pryzm/no-three-outside-committer` (14) + any other
   P2-tagged rows** — these are CI-enforced architecture violations (P2: single THREE
   owner), not style. Each needs a real look at whether the import is legitimate (this
   *is* the THREE-owning package, so some may be false positives from the rule's scope
   config) or a genuine violation needing the THREE usage moved/wrapped. **Do not
   blanket-suppress — these are exactly what P2 exists to catch.**
3. **`no-restricted-imports` (126, spread across apps/editor, core-app-model,
   annotations, api-gateway, several geometry-* packages)** — each is a layer-boundary
   violation (L7/L6/L5 imports, or `express`/`@thatopen/components` scope rules). These
   need per-file judgment: move the import behind the SDK facade, or the violation is
   real debt requiring an architectural fix, not a lint suppression. Highest-count
   files first: `apps/editor` (27), `plugins/annotations` (24), `core-app-model` (18),
   `apps/api-gateway` (14).
4. **`no-unused-vars` (73, mostly `plugins/wall`, `tools/ga-gate`,
   `tools/spanish-genome-probe`)** — mechanical, low-risk. Safe to batch-fix by removing
   dead bindings once each is confirmed truly unused (not a destructure placeholder).
5. **Remainder** (`no-useless-escape`, `no-irregular-whitespace`, `no-unreachable`,
   `no-control-regex`, `pryzm/store-single-channel`, `pryzm/affected-stores-required`,
   `no-misleading-character-class` — 22 rows total) — long tail, fix opportunistically
   alongside whichever file each sits in.

## Status

- [ ] `packages/command-registry` no-empty (110) — not started
- [ ] `packages/renderer-three` P2 review (14) — not started
- [ ] `no-restricted-imports` sweep (126) — not started
- [ ] `no-unused-vars` sweep (73) — not started
- [ ] long tail (22) — not started

Update this file's checklist as batches land; link the PR/commit per checked item.
Do not delete failed/red findings from here once fixed elsewhere — mark done, don't
remove the row, so the history of what was ever red stays legible.
