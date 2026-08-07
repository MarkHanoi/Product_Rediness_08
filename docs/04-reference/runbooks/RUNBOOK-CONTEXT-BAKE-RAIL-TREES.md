# Runbook — bake + publish `rail` and `trees` context tiles to R2

> **Written 2026-08-07** (docs-reconciliation, from `tools/context-bake/bake.mjs` +
> `.github/workflows/context-bake.yml`). Closes the gap logged as **L-730**: the client
> requests `tiles/rail.pmtiles` and `tiles/trees.pmtiles` and both 404 on R2. Both layers
> ARE fully declared in `bake.mjs` `LAYERS` with live consumers/renderers
> (`contextRail.ts`; instanced point trees) — the fix is to BAKE and PUBLISH them, never
> to de-configure the reader. Related: ADR-0307 §Left-undone.

## What the two layers are (already encoded in `bake.mjs` `LAYERS`)

| id | osmium filter | geom | zooms | notes |
|---|---|---|---|---|
| `rail` | `w/railway` (WAYS only — nodes carry no geometry worth tiling) | linestring | 10–16 | consumer (`contextRail.ts`) keeps only active rail classes (rail/light_rail/subway/tram/…) |
| `trees` | `n/natural=tree` (nodes only) | point | 14–16 | §FORMA-CTX-TREES (L-642 Phase C); wooded areas already ride `parks` — this is strictly point trees |

Both use `--drop-densest-as-needed`. Output names are path-stable:
`out/rail.pmtiles`, `out/trees.pmtiles` → R2 keys `tiles/rail.pmtiles`,
`tiles/trees.pmtiles`.

## Steps

### 1. Bake

Preferred path — GitHub Actions (`context-bake.yml`, workflow_dispatch):

- `layer` input: run TWICE (once `rail`, once `trees`) or leave blank to bake ALL layers.
  ⚠ Baking ALL is the safer default given step 2's replace semantics.
- `region` input: leave **blank** (= ALL declared regions). ⚠ A scoped `region` run +
  publish REMOVES every other region from the published tileset — each layer is ONE
  global `.pmtiles` and the publish is an `aws s3 sync` that REPLACES it.
- Local fallback: `node tools/context-bake/bake.mjs` needs `osmium` + `tippecanoe`
  (auto-detected; Docker fallback otherwise). National bakes are multi-hour and
  memory-hungry (`HEAP_FLOOR_MB_NATIONAL = 6000`).

**BLOCKED-ON-OPS**: the Actions account is under an intermittent billing block (L-655 —
jobs die in ~3–12 s with a payment message; that is BILLING, not the code). If blocked,
either clear billing or run the bake locally/Docker.

### 2. Publish to R2

The workflow's `publish` input drives `aws s3 sync tools/context-bake/out
s3://pryzm-assets/tiles` against `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, with
`Cache-Control: public, max-age=31536000, immutable`.

**BLOCKED-ON-OPS**: requires repo secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY` (the workflow refuses politely when unset — the bake artifact is
still valid and can be published later by anyone holding credentials).

⚠ **Partial-publish semantics**: the sync uploads whatever is in `out/`. Publishing a run
that baked only `rail`+`trees` is fine (it only adds/overwrites those two keys) — but
publishing a run that baked a SUBSET OF REGIONS for an existing layer replaces that
layer's global archive with the subset. When in doubt, bake all layers, all regions.

### 3. Verify the publish — BEFORE touching any version constant

1. Public readability + range-servability for each new key, e.g.
   `curl -sI "https://<public-r2-base>/tiles/rail.pmtiles"` → 200, then a ranged read
   (`-H "Range: bytes=0-16383"`) → 206. (The workflow's own verify step does this for the
   baked layers when `publish=true`.)
2. `tools/context-height-probe/probe.mjs` reads `CONTEXT_TILESET_VERSION` out of the
   client source so probe and browser can never disagree about which tileset they see.
3. In-app: the reader logs `unavailable` per missing layer — after a verified publish the
   `rail`/`trees` `unavailable` lines must disappear (hard-refresh: the SW is
   network-first but the browser HTTP cache holds the old `?v=` URL for a year).

### 4. Bump `CONTEXT_TILESET_VERSION` — ONLY after step 3 verifies

`apps/editor/src/ui/geospatial/contextTiles.ts` →
`export const CONTEXT_TILESET_VERSION = '…'`.

The rule, already encoded at the constant and paid for once with a lost day (L659a/L660a
history in that file): **BUMP THE STAMP WHEN THE BAKE PUBLISHES, NEVER WHEN IT IS
DISPATCHED.** The stamp is a claim about what is IN R2; `.pmtiles` keys are path-stable
and served `immutable` for a year, so a stamp bumped for a bake that then fails to publish
poisons the new stamp with the old bytes — strictly worse than not bumping.

- New keys (`rail`/`trees` did not exist before): a bump is still required if ANY existing
  layer was re-baked in the same publish; if the publish added ONLY the two new keys, no
  browser holds a cached copy, but bumping anyway is harmless and keeps the probe/browser
  contract simple. Never paper over staleness with ad-hoc `?t=Date.now()`.
- One constant, both consumers (client + `tools/context-height-probe/probe.mjs`) — never
  fork it.

### 5. Close the audit row

Flip **L-730** in `docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md` to FIXED with the run
id and the verification evidence (step 3), per the deploy→test feedback convention.
