# NOTICE — third-party attributions

This file reproduces the notices PRYZM is **obliged** to reproduce.

> ⛔ **It is not documentation and it is not a courtesy list.** It is generated from
> and checked against the ledger at
> [`packages/schemas/src/materials/materialProvenance.ts`](packages/schemas/src/materials/materialProvenance.ts)
> by **`tools/ga-gate/check-material-single-source.ts` ARM F**. Deleting an entry
> below, or adding an `attributionRequired: true` upstream without adding its text
> here, turns that gate RED. That is the point: an attribution obligation held in a
> comment is an obligation one refactor away from being breached silently.

**To change this file, change the ledger and re-run the gate.** Every entry's text
is `MaterialUpstream.attributionText`, verbatim.

---

## Materials

### pascalorg/editor — the manifest and its taxonomy

Portions of PRYZM’s material taxonomy — specifically the observation that a
building editor’s finishes declare which element slots they suit — were informed by
pascalorg/editor (MIT).

MIT License
Copyright (c) 2026 Pascal Group Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be included in all copies
or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## Upstreams that require no notice, recorded anyway

Listing these is not an obligation; it is so that a reader can tell *"no notice was
owed"* from *"nobody looked"* — which is the same two-values-one-slot problem the
ledger exists to prevent.

| upstream | licence | notice owed? | what we took |
|---|---|---|---|
| **ambientCG** | `CC0-1.0` | **no** — CC0 waives the attribution condition | texture bitmaps (the 16 file-backed material sets) |
| **PRYZM (authored)** | proprietary | no | the flat-colour catalogue rows |
| **PRYZM (`@pryzm/procedural-textures`)** | proprietary | no | every `procedural:` pattern — generated arithmetic, no upstream file exists |

## Upstreams DELIBERATELY NOT SHIPPED

| upstream | status | why |
|---|---|---|
| **pascalorg/editor — the 288 texture binaries** | `NOT_ESTABLISHED` | The repository is MIT, but MIT covers what its authors had the right to license. A complete tree walk (re-measured 2026-08-23 on a local clone: 288 tracked files, working tree clean) finds **zero** CREDITS, NOTICE, attribution or per-directory README anywhere under `apps/editor/public/material/**`, and zero occurrences of "ambientCG", "Poly Haven", "CC0" or "attribution" in the whole repository. The assets arrived in one squashed vendor-bump commit whose message names no texture source. **No byte of it is copied, downloaded, vendored or derived from.** The full reasoning is in the ledger row and in `docs/04-reference/PASCAL-FINISHES-RESEARCH.md` §0.2. |
