# ADR-0300 — One site framing extent

| Field | Value |
|---|---|
| **Status** | Accepted — 2026-08-07 |
| **Tag** | `§SITE-FRAMING-EXTENT` |
| **Owner** | Site / PRYZM Earth |
| **Closes** | Founder, 2026-08-07: *"2D GIS view is TOO ZOOMED OUT — and the 3D Site is TOO ZOOMED IN. They need to be COHERENT — middle point, showing the same scale (more or less) and ideally the same area."* |
| **Related** | PRD §22 (zoom-then-split reveal), `§GLOBE-FIT-BUILDING` (ADR-0095), C60 §4 (camera ports), [ADR-0301](ADR-0301-zoom-fits-extent.md) |
| **Constraints** | C06, C12 (WGS84 degrees only, no ENU assumed), P4 (no globals), P8 (span on the exported resolver) |
| **Implemented by** | `3fa29748` (authority + tests); `getMapInitial` wiring and the reveal-call-site reframe pending the isolation agent's work in `GISAreaLayout.ts` / `CesiumViewport.ts` |

---

## Context

At the moment the split revealed, the two panes showed the same site at scales roughly **three orders of magnitude apart** — left, the Barcelona metropolitan area from Sant Cugat to El Prat; right, a handful of façades at ~20 m range.

**Neither pane was framing the site, and that is the whole defect.** Each framed a different *object*, and both objects were the wrong one:

- The **2D pane** fits the raw Nominatim bbox. For a city-level result that bbox is the **administrative boundary of the municipality**. `fitBounds` caps `maxZoom: 18` — a ceiling, so a tiny bbox cannot over-zoom — but there was **no floor**, so a municipality bbox zoomed all the way out and did exactly what it was told.
- The **3D pane** fits the placed building's bounding sphere: `§GLOBE-FIT-BUILDING flyToBoundingSphere: radius 6.9 m, range 20 m` — a 7-metre object, or a default 10 × 8 m plot before the user has authored anything.

This is not "two zoom levels that need tuning". Tuning them independently is a shortcut *precisely because* it leaves two authorities that will drift apart again the first time either object changes.

## Decision

One extent, derived once, that both cameras are computed from — `apps/editor/src/ui/site/siteFramingExtent.ts`, DOM-free so the coherence property is directly assertable.

`resolveSiteFramingExtent` prefers, best evidence first:

1. a **committed boundary** — it *is* the site;
2. a **geocode bbox, only when already site-scale** (`SITE_FRAMING_MAX_HALF_M = 600 m`);
3. `SITE_FRAMING_HALF_M = 250 m` about the anchor.

**Rule 2's rejection is the load-bearing line.** An administrative bbox answers a different question ("where is Barcelona") than the split is asking ("where is this site"), and is discarded rather than fitted. On rejection the extent centres on **the anchor the user typed**, not the bbox centroid — which for a municipality can be a kilometre away.

`altitudeForHalfSpan(halfSpanM, fovDeg)` converts the same extent into a camera altitude, so the 3D pane derives from the shared value instead of a separately-chosen zoom.

The 3D reframe is taken **at the split-reveal call site**, passing the extent-derived range. The `flyToBoundingSphere` primitive is *not* altered: it has other callers, and changing it would change framing in paths nobody has tested.

## Consequences

- The panes cannot disagree without the extent itself being wrong — one thing to reason about instead of two.
- `SITE_FRAMING_HALF_M` sits inside the near context ring (`CONTEXT_BBOX_HALF_DEG` ≈ 890 m), so everything framed is backed by context geometry that has actually been fetched. A wider default would frame ground we draw nothing on.
- The resolver is **total**: every input yields a usable extent, because a surface that cannot frame is a surface that renders nothing.
- **A site-scale frame streams far fewer tiles than a metro-scale one.** The founder's *"graphics while zooming are bad"* should be re-measured *after* this lands, before any change to flight duration.
- ⚠ A geocode bbox between 600 m and site scale is discarded rather than clamped. Deliberate — a bbox that large is more likely a district than a plot — but it is the first thing to revisit if users report framing that ignores a genuinely large parcel.

## The generalisable lesson

**Two surfaces showing "the same thing" must derive from one value, not from two values that happen to agree today.** Each pane here was individually defensible — fit the geocode result; fit the model — and together they were absurd. Coherence between views is a property of the *source*, not something to be restored by tuning each consumer.
