# texture-pipeline — CC0 PBR texture acquisition, compression and publishing

**Lane MAT-2 · L-1720–L-1724 · §TEXTURE-PIPELINE.** Serves [C100 §10.6](../../docs/02-decisions/contracts/C100-MASTER-MATERIAL-DATABASE.md)
(*"asset hosting is a named, unsolved dependency"*) and unblocks the asset half of **S28**.

This directory owns **sourcing, compressing, publishing and proving**. It does **not** own the
`MaterialRecord` shape, the resolver or the render path (MAT-1), nor procedural pattern generation
(MAT-3).

---

## ⛔ The licence rule, first, because it binds everything else

`docs/04-reference/PASCAL-FINISHES-RESEARCH.md` §0 established that the reference product's repo is
MIT but its **288 texture files carry zero attribution** — no CREDITS, NOTICE or per-directory
README anywhere in a complete tree walk. **MIT covers what the authors had the right to license; it
is not a warranty over third-party binaries.**

> ⛔ **No file from `pascalorg/editor` is copied, downloaded, vendored or derived from. We take the
> taxonomy only.**

Everything here comes from **explicitly CC0 libraries**, and `acquire.mjs` enforces that
mechanically: a licence gate runs **before any network call** and refuses any material whose source
library is not declared with a complete licence block on the `ALLOWED_LICENCES` allowlist. There is
no flag to bypass it.

| library | licence | verified | commercial use | attribution |
|---|---|---|---|---|
| [ambientCG](https://ambientcg.com) | `CC0-1.0` | [docs.ambientcg.com/license](https://docs.ambientcg.com/license/), 2026-08-21 | yes | not required |

We record provenance anyway — **a library with no provenance record is how you end up in the
position above.**

---

## The three artefacts

| file | what it is | in git? |
|---|---|---|
| `sources/materials.json` | ⭐ **the declared source list** — data, reviewed in a diff | **yes** |
| `textures.manifest.json` | ⭐ **the provenance + integrity record** — generated, never hand-edited | **yes** |
| `out/**` | acquired archives, extracted maps, compressed output | **no** (git- and docker-ignored) |

### ⭐ Storage: the bytes live in R2, not in git

`textures.manifest.json` carries a **SHA-256 for every source archive and every published file**, so
the set stays verifiable without adding ~47 MB of binaries (growing with every material) to the
repo. `public/items` already demonstrates the other choice: ~185 MB of GLB in git that must then be
`.dockerignore`d back out of the image.

**The manifest is the source of truth; the bytes are re-derivable AND verifiable.** A hash in a
small JSON gives the integrity guarantee that committing the binaries would have given, at no repo
weight. `out/` is covered by `.gitignore` and by `.dockerignore`'s existing `tools/*/out` rule.

---

## Running it

```bash
node tools/texture-pipeline/acquire.mjs --dry-run     # licence gate + resolve, download nothing
node tools/texture-pipeline/acquire.mjs               # download, normalise, write the manifest
node tools/texture-pipeline/compress.mjs              # -> out/dist/**.webp
npx tsx tools/texture-pipeline/verify-delivery.mts    # ARMs A + B (offline)
npx tsx tools/texture-pipeline/verify-delivery.mts --base https://…/items/   # + ARM C (network)
```

`compress.mjs` needs an image encoder. It resolves `sharp` **softly** and never declares it: `tools/*`
is a pnpm workspace pattern, so a `package.json` here would add a workspace importer and break
`pnpm install --frozen-lockfile` for every other lane. CI installs it standalone and pinned — the
same pattern `terrain-bake.yml` uses.

Publishing is `.github/workflows/r2-sync-textures.yml` (manual dispatch), which re-derives the bytes
in CI and refuses to upload if they do not match the committed manifest.

---

## ⚠ Format: WebP ships, KTX2 is the end state

`catalogAssetProxy.js` allowlists `.ktx2`, which reads like KTX2 is supported end-to-end. **It is
not.** Measured 2026-08-21:

```
grep -rn "KTX2Loader" packages apps plugins src   -> ZERO HITS
packages/persistence-client/src/codec/ktx2.ts     -> a STUB, "returns the input bytes unchanged"
```

The repo can **deliver** a `.ktx2` and cannot **decode** one — that needs `KTX2Loader` plus the
`basis_transcoder` wasm pair wired into the renderer, which is MAT-1's seam. Shipping KTX2-only
would publish assets whose only possible state is "broken", which is exactly what C100 §10.6
forbids.

**WebP is therefore the shipping format**, and not grudgingly: `THREE.TextureLoader` decodes it
through the browser's own decoder with zero wiring, `.webp` is already allowlisted, and the set
compresses **216.8 MB → 47.0 MB (22%)**. ⚠ Its real cost against KTX2 is **GPU memory, not wire
bytes** — WebP decodes to uncompressed RGBA in VRAM where Basis stays compressed. `--ktx2` emits
KTX2 as a *second* output the moment a decoder exists.

---

## ⛔ What is proven, and what is not

`verify-delivery.mts` prints this every run, and it is the point of the script:

- ✅ **ARM A** — every published key is accepted by the *real* proxy guard (`isSafeCatalogKey`) and
  the *real* client rewriter (`resolveCatalogAssetUrl`). Imported, not re-implemented.
- ✅ **ARM B** — every file matches its manifest SHA-256 and decodes as a WebP of the recorded size.
- ⚠ **ARM C** — HTTP status, content-type and a hash match of the *delivered* bytes.

> ⛔ **ARM C DOES NOT ESTABLISH THAT A BROWSER CAN READ THEM.** Node's `fetch`, `curl` and
> `aws s3 ls` do not enforce CORS. ISSUE-LOG **L-578**: the GLB catalogue had a green upload, green
> bundle proof, green CSP and green deploy while a browser refused every asset — **for four
> deploys**. Only a real browser tab settles it.
>
> ⛔ **AND NO TEXTURE REACHES A MATERIAL YET.** `MaterialRecord` has no `maps` field and no producer
> writes one (C100 §10.6: `.textures` is read at seven sites and *"written by nothing"*). Published
> and reachable are different facts.

**One blocker the GLB path had that textures do not:** `server/securityHeaders.js:270` sets
`imgSrc: ["'self'", 'data:', 'blob:', 'https:']`, so CSP does not gate textures the way
`connect-src` gated GLBs. CORS still applies, because `TextureLoader` sets `crossOrigin` (WebGL
requires CORS-clean textures) — so the **same-origin proxy route is the one that works today**.
