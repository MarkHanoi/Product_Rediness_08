# Object storage — Cloudflare R2 (decision record)

**Status:** DECIDED (founder, 2026-07-21). Unblocks L-513 (context tiles) + the furniture-GLB 404.
**Owner action pending:** create the bucket + a public domain + API token, then hand the credentials
to the build. Until then the code is ready but has nowhere to read/write.

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

1. **[founder]** create bucket + public domain + token → hand over the 4 `R2_*` values + the base URL.
2. **[code]** wire the GLB base URL (quick win — kills the 404 as soon as the catalog is synced).
3. **[code]** write the GitHub-Actions bake+upload job (L-513a) using the `R2_*` secrets.
4. **[founder]** click "Run" on the bake job → tiles land in `pryzm-assets/tiles/`.
5. **[code]** wire the client tiles reader (L-513b) + set `VITE_CONTEXT_TILES_URL`.

Steps 2–5 are all mine; only 1 and 4 need the founder. **Step 1 is the single unblock** — it cascades
into both the tile pipeline and the GLB fix.

**Cross-refs:** L-513 (context tile bake + reader), `CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md` §8/§9,
`tools/context-bake/`, the furniture-GLB-404 issue, memory `furniture-glb-404-object-storage`.
