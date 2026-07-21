# Object storage — Cloudflare R2 (decision record)

**Status:** DECIDED (founder, 2026-07-21) → **PROVISIONED + WIRED (L-570 / L-571, same day).**
Bucket `pryzm-assets` exists with prefixes `items/` + `tiles/`; the `R2_ACCOUNT_ID` /
`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` repo secrets are set; the client and both publish
workflows are wired. **Remaining owner action: click "Run workflow" on the two jobs below.**

## What is wired (read this before changing anything here)

| Piece | Where | Note |
|---|---|---|
| Public base URL | `https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev` | **NOT a secret** — it ships in the client bundle by design. |
| GLB/thumbnail URL resolution | `apps/editor/src/ui/furniture-carousel/catalogAssetUrl.ts` | Logical `/items/…` → `${VITE_GLB_URL}…`; **exact identity when the var is unset**, so local dev is unaffected. |
| Build-time plumbing | `deploy-fly.yml` → `--build-arg` → `Dockerfile` `ARG/ENV` → vite | Both `VITE_GLB_URL` and `VITE_CONTEXT_TILES_URL`. |
| Base-URL source | repo **variables** `vars.VITE_GLB_URL` / `vars.VITE_CONTEXT_TILES_URL` | Deliberately `vars`, not `secrets` — a secret is redacted from the log, hiding the one diagnostic that matters when the 404s persist. Setting the variable is the ONLY change needed to move to `assets.pryzm.app`. |
| Proof the base URL shipped | `deploy-fly.yml` step **§L-570-BUNDLE-PROOF** | Greps the LIVE bundle for the R2 host and **fails the job** if absent. |
| Publish the catalogue | `.github/workflows/r2-sync-items.yml` (`workflow_dispatch`) | `public/items` → `s3://pryzm-assets/items`, then probes the public URL for 200. |
| Publish the tiles | `.github/workflows/context-bake.yml` (`workflow_dispatch`) | Bake → `s3://pryzm-assets/tiles`, then probes with `Range:` requiring **206**. |

⚠ **THE ONE THING THAT WILL BITE ANYONE EDITING THIS.** `VITE_*` variables are **build-time** —
vite inlines them into the bundle. Setting `VITE_GLB_URL` as a **Fly runtime secret does nothing**,
and the failure is **completely silent**: the build succeeds, the deploy succeeds, the app comes up,
and it keeps requesting the old 404ing paths with no error anywhere. That is why the value is a
`--build-arg` and why the deploy asserts against the shipped bytes rather than trusting the config.

⚠ **`VITE_CONTEXT_TILES_URL` is intentionally EMPTY.** The client PMTiles reader (L-513b) does not
exist yet. Setting that variable before it ships would bake a base URL nothing reads.

## Why R2 (not S3 / B2 / a Fly volume)

The stack already runs on Cloudflare (Pages + Workers `CF_WORKER_URL` + DNS), so R2 is the natural fit:
- ✅ **No egress charges** when served through Cloudflare.
- ✅ **HTTP Range Requests** supported natively — REQUIRED for PMTiles (it reads a byte-range per tile,
  returns `206 Partial Content`). No special server code.
- ✅ Serves large `.glb` files efficiently.
- ✅ Native Worker integration; very inexpensive.
- ❌ A Fly volume was explicitly rejected — per-machine, no CDN range serving, re-bloats the image.

**One bucket is enough**, two prefixes.

## Bucket layout

```
pryzm-assets
├── tiles/
│   ├── buildings.pmtiles
│   ├── roads.pmtiles
│   ├── water.pmtiles
│   └── green.pmtiles
└── items/
    ├── chair.glb
    ├── sofa.glb
    └── … (the 185 MB furniture catalog, .dockerignore'd out of the Fly image on purpose)
```

## Owner setup (Cloudflare dashboard — the part only the founder can do)

1. **Create bucket** — R2 → Create Bucket → `pryzm-assets`.
2. **Make it public** — the bucket's Public Domain. Either a custom domain (`assets.pryzm.app` /
   `cdn.pryzm.app`) or the auto `https://pub-xxxxxxxx.r2.dev` endpoint. **Switching from r2.dev to the
   custom domain later needs NO app change** — only the env var below.
3. **API token** — My Profile → API Tokens → R2 → Create Token; permissions **Object Read + Object
   Write**, scoped to **only `pryzm-assets`**. Yields an **Access Key ID** + **Secret Access Key**.

## Env var contract (what the client build reads)

Set in Cloudflare Pages (and any other frontend build env):

```
VITE_CONTEXT_TILES_URL=https://assets.pryzm.app/tiles/
VITE_GLB_URL=https://assets.pryzm.app/items/
```

(or a single `VITE_ASSETS_URL=https://assets.pryzm.app/` with `tiles/…` + `items/…` composed in code.)

- **Tiles reader (L-513b)** gates on `VITE_CONTEXT_TILES_URL` — falls back to live Overpass while unset,
  so nothing breaks before the bucket exists.
- **GLB loader** — swap the current `/items/chair.glb` (404s in prod) for `${VITE_GLB_URL}chair.glb`.
  No other code change expected.

## Upload (dev or CI) — S3-compatible, endpoint override

```bash
aws configure           # Access Key ID / Secret / Region=auto
# tiles
aws s3 sync bake-output/tiles s3://pryzm-assets/tiles --delete \
  --endpoint-url=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
# furniture
aws s3 sync furniture s3://pryzm-assets/items --delete \
  --endpoint-url=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

`rclone` works equally well. This is the same command the L-513a bake job will run to publish.

## Secrets the build/upload env needs

| Secret | Value / purpose |
|---|---|
| `R2_BUCKET_NAME` | `pryzm-assets` |
| `R2_ACCOUNT_ID` | Cloudflare account ID (in the R2 endpoint URL) |
| `R2_ACCESS_KEY_ID` | upload access |
| `R2_SECRET_ACCESS_KEY` | upload access |
| `VITE_CONTEXT_TILES_URL` | `https://assets.pryzm.app/tiles/` |
| `VITE_GLB_URL` | `https://assets.pryzm.app/items/` |

For the GitHub-Actions bake job (see L-513a), the four `R2_*` secrets go in the repo's Actions secrets;
the two `VITE_*` go in the Cloudflare Pages build env.

## Caching (do this once the bucket is public)

Add Cloudflare **Cache Rules** in front of R2:
- Cache `.pmtiles` and `.glb` for **1 year** — `Cache-Control: public, max-age=31536000, immutable`.
- Use **versioned filenames** (or a cache-busting query) when an asset changes, since `immutable` means
  clients won't re-check. (The bake can stamp a version into the tile path, e.g. `tiles/v1/…`.)

Result: global CDN distribution, fast PMTiles range reads, minimal ongoing cost.

## Ordering (the dependency chain)

1. ~~**[founder]** create bucket + public domain + token~~ — ✅ **DONE 2026-07-21.**
2. ~~**[code]** wire the GLB base URL~~ — ✅ **DONE (L-570).**
3. ~~**[code]** write the GitHub-Actions bake+upload job (L-513a)~~ — ✅ **DONE (L-571).**
4. **[founder]** click "Run workflow" on **Sync furniture GLB catalogue to R2** → the catalogue
   lands in `pryzm-assets/items/`. The job itself verifies public readability, so a bucket that is
   still private fails loudly here instead of looking like a code bug later.
5. **[founder]** click "Run workflow" on **Bake context tiles → R2 (L-513a)** → tiles land in
   `pryzm-assets/tiles/`. It has never been executed; the first run is its test.
6. **[code]** wire the client tiles reader (L-513b) — needs `pmtiles` + `@mapbox/vector-tile` +
   `pbf` with `pnpm-lock.yaml` committed in the SAME commit (`--frozen-lockfile`) — **then** set
   `VITE_CONTEXT_TILES_URL`, in that order.

Only 4 and 5 need the founder now.

**Cross-refs:** L-513 (context tile bake + reader), `CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md` §8/§9,
`tools/context-bake/`, the furniture-GLB-404 issue, memory `furniture-glb-404-object-storage`.
