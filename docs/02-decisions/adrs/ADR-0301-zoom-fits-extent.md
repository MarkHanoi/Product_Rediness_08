# ADR-0301 — Zoom fits extent

| Field | Value |
|---|---|
| **Status** | Accepted — 2026-08-07 |
| **Tag** | `§CTX-ZOOM-FITS-EXTENT` (L-662) |
| **Owner** | Site / geospatial context |
| **Closes** | Founder console, 2026-08-07: `landuse: bbox needs 1296 tiles at z16, over the 64 cap`; `water: … 2401 tiles …` — both falling back to live Overpass |
| **Related** | L-513b (`§CTX-PMTILES-READER`), `§CONTEXT-DATA-HONESTY` (L-422/457/467/469), [ADR-0300](ADR-0300-one-site-framing-extent.md) |
| **Constraints** | C06, the L-513b honesty contract (a failure is never an empty result) |
| **Implemented by** | `3fa29748` |

---

## Context

The two widest context layers were **never served from the baked tiles, on any search, anywhere** — they blew the 64-tile cap on every read and fell back to live Overpass, the third party this entire subsystem exists to remove.

**The obvious explanation is wrong, and acting on it would have sent the fix to the wrong file.** The intuitive story — a municipality-sized geocode bbox blowing the cap, therefore fixed as a side effect of ADR-0300 — does not hold. These extents are **declared constants** in `CesiumViewport`:

- `CONTEXT_WIDE_HALF_DEG = CONTEXT_BBOX_HALF_DEG * 9` → 0.072°, ~8 km radius (the city ground wash)
- `CONTEXT_SEA_HALF_DEG = CONTEXT_BBOX_HALF_DEG * 12.5` → 0.10°, ~11 km (the sea)

At z16 a tile is ~450 m, so those spans need ~1,008 and ~1,900 tiles **regardless of what the user searched for**. The cap was not tripped by a bad bbox. It was tripped by asking for **building-scale precision across 16–22 km of ground** — precision nobody wants for a landuse wash or a coastline.

> ⚠ This ordering was checked *before* being built on, at the cost of one extra investigation. Had ADR-0300 been done first on the assumption that this followed, this layer would still be broken and we would have believed it fixed.

## Decision

The read zoom is chosen from the **extent**, not fixed per layer: the finest zoom whose fan-out fits the cap, clamped to the tileset's own `minZoom`.

The cap still bites when even the minimum zoom cannot cover the bbox — the reader **refuses rather than truncating**, because a partial ring that *looks* complete is the exact failure mode L-513b exists to avoid.

Measured against the real archive:

| layer | before | after |
|---|---|---|
| landuse | 1,296 tiles at z16 → Overpass | **z13, 30 tiles, 8,246 features, 1,165 ms** |
| water | 2,401 tiles at z16 → Overpass | **z13, 49 tiles, 5,283 features, 650 ms** |
| buildings | z16 | **z16 — unchanged** |

`buildings` resolving unchanged is the property that makes this safe: the hot path is untouched.

## Consequences

- Two degraded Overpass paths are removed outright.
- Layer zoom becomes a *preference*, not a guarantee — a wide read may be coarser than `LAYER_ZOOM` declares. Correct for area washes and coastlines; it would **not** be acceptable for `buildings`, which is why that layer must keep resolving at z16 for its declared extents. A future extent widening for `buildings` needs re-checking, not just re-running.
- ⚠ **Found while testing: the guard against a nonsense extent was itself an out-of-memory crash.** The first implementation asked `tilesCovering().length`, which allocates one object per tile; a hemisphere-wide bbox at z16 is ~10⁹ tiles, and it killed the vitest worker. `tileCountCovering` is the same arithmetic without the array.
  > **A guard that crashes on the input it exists to reject is not a guard.**

## The generalisable lesson

**A plausible causal chain is not a verified one.** "The bbox is too big, therefore the tile count is too high, therefore fixing the bbox fixes the tile count" was coherent, was believed by two people, and was false — the extents are constants and never depended on the bbox at all. Check the link before you build the second fix on top of the first.
