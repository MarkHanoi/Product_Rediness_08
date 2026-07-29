# BUILDING-HEIGHT REPLICATION STANDARD

> **The per-city standard for HONEST 3D building heights** — the heights analogue of
> `ENVELOPE-REPLICATION-STANDARD.md` (ADR-0279). Tracks audit **L-646**.
> **Status:** DRAFT (2026-07-29). Plan-first, per the founder's pattern ("document like the
> envelope, then implement"). Nothing here changes a rendered height yet.
>
> **Governance / conflict order:** VISION → ARCHITECTURE → contracts → ADRs → SPECs.
> Binds: **C62** (Data-Confidence/Provenance — heights MUST use this shared vocabulary, not a new
> scale), **C12** (geospatial), **C58 §1.2** (a derived value must never claim `structured`),
> **§CONTEXT-DATA-HONESTY** (unknown stays typed-unknown; a value is never fabricated to fill a
> slot). Related: L-459 (height provenance shipped), L-525 (BCN 13a ordinance-height gap),
> `GEO-DATA-SOURCING-MASTER.md`, ADR-0277/C61 (terrain/height confidence, if present).

---

## 0 — Why this exists (the diagnosis, code-confirmed)

Context building heights are frequently wrong because the source ladder bottoms out in a
**fabricated default**. In `apps/editor/src/ui/geospatial/contextBuildings.ts`:

- `resolveContextHeight(tags)` resolves an extrusion height + a `heightProvenance`:
  - **`tagged`** — explicit OSM `height` / `building:height` (a surveyed-ish number).
  - **`derived-levels`** — `building:levels` (real storey COUNT) × `LEVEL_HEIGHT_M ≈ 3.2` (invented storey height).
  - **`assumed`** — nothing usable tagged → `DEFAULT_BUILDING_HEIGHT_M = 9` m ([:234](../../apps/editor/src/ui/geospatial/contextBuildings.ts#L234)).
- The code itself records the root (≈:559): *"OSM height tagging is SPARSE outside a few
  well-mapped regions, so in a typical city MOST buildings fall to `assumed` 9 m → the uniform
  low-rise carpet look, and it is why the founder's 'real heights' ask is not met."*

So provenance is already **legible** (L-459 — good), but the pipeline (a) leans on OSM tags that
are patchy, (b) has **no measured fallback** (no LiDAR DSM−DTM, no national dataset join), and
(c) still renders the fabricated 9 m as if it were a real height. The massing prism has the sibling
gap (L-525): a Barcelona 13a *alçada reguladora* is a function of STREET WIDTH we don't fetch, so it
also falls back to a fabricated default.

**This standard does NOT invent better numbers — it makes every height's ORIGIN explicit, adds a
MEASURED source above OSM tags where a jurisdiction publishes one, and forbids a fabricated default
from reading as authoritative.**

---

## 1 — The honest height model (the source ladder × C62)

A building's height is resolved by the FIRST rung that yields a value, and it carries a **C62
`DomainConfidence`** (`{ tier, score, authorityRank, validationState, unknownReason? }`) — never a
bare number. Subsystems read the confidence; they never treat `heightM` as measured without it.

| Rung | Source | Provenance (L-459) | C62 tier / authorityRank | Notes |
|---|---|---|---|---|
| 1 | National **LiDAR / DSM−DTM** or 3DBAG-type dataset | `measured-lidar` (NEW) | `structured` / `regional-gis` | Real roof height minus terrain. Where a country publishes it. |
| 2 | OSM `height` / `building:height` | `tagged` | `structured` / `osm` | Surveyed-ish; trust but rank below authority LiDAR. |
| 3 | OSM `building:levels` × assumed storey height | `derived-levels` | `estimated` / `osm` | Real COUNT, invented storey metres → NOT `structured` (C58 §1.2). |
| 4 | Ordinance-derived (e.g. BCN 13a street-width → *alçada reguladora*) | `derived-ordinance` (NEW) | `estimated` / `inspire` | L-525. A labelled derivation, not a survey. |
| 5 | Nothing usable | `unknown` (was `assumed` 9 m) | `unknown` + `UnknownReason` | **Must render distinctly** (see §3) — never a confident solid at a fabricated height. |

**Invariant:** rung 5 is `value: null` + a typed `UnknownReason` (`authority-does-not-publish` /
`not-queried` / …), NOT a silent `9`. If a placeholder height is needed to draw *something*, it is
rendered in the explicit "unknown height" style, exactly as the envelope draws an unknown-setback
extent as an upper-bound, not a solved solid (L-616).

---

## 2 — The 5-slot per-city onboarding (mirrors the envelope's 5 slots)

To bring a city's heights to **verified**:

1. **H1 — OSM coverage probe.** Measure the `tagged` + `derived-levels` vs `assumed` split for the
   city's baked buildings (the "default-fire rate"). Honest number, per city.
2. **H2 — Authority height source.** Identify the national/regional MEASURED dataset (LiDAR DSM,
   3DBAG, cadastral height) from `GEO-DATA-SOURCING-MASTER.md`; wire the DSM−DTM (or dataset) join.
3. **H3 — Ordinance height (where the massing prism needs it).** The regulated height (e.g. BCN
   street-width → *alçada reguladora*, L-525) — a `derived-ordinance` rung, per rule-pack.
4. **H4 — Confidence stamping.** Every resolved height carries the C62 `DomainConfidence` of its rung.
5. **H5 — VERIFICATION sign-off.** A human confirms the source ladder + coverage for the city and
   signs `sources/VERIFICATION.md` (the L-449-style gate) → the city's heights graduate to verified.

---

## 3 — CI fidelity gate (the heights analogue of the envelope gate)

A static/CI check (analogue of `tools/ga-gate/check-zoning-fidelity-label.ts`) that FAILS the build
if a fabricated/`unknown` height is rendered as authoritative — i.e. the `unknown` rung must map to
the explicit unknown-height render style, never a confident extrusion at `DEFAULT_BUILDING_HEIGHT_M`.
This is what stops the "uniform 9 m carpet presented as real" from silently shipping.

---

## 4 — Per-country sourcing (seeded from GEO-DATA-SOURCING-MASTER)

Heights pigg-back on the SAME national datasets the terrain/geo sourcing already maps:
- **NL** — 3DBAG (per-building measured height) — the strongest.
- **NO / UK** — derive height = **DSM − DTM** (national LiDAR) where OSM is silent.
- **ES (Barcelona)** — OSM tags + ordinance *alçada reguladora* (L-525); national PNOA-LiDAR as the
  measured rung where feasible.
- **DK / SE / FI / PT** — national LiDAR behind a free account + repo secret (same gate as terrain).
- Everywhere — OSM `height`/`levels` as rungs 2–3; `unknown` (typed) where none.

*(Coverage numbers per city are DELIBERATELY not stated here — they are produced by the H1 probe,
never guessed. §CONTEXT-DATA-HONESTY.)*

---

## 5 — Implementation sequence (after sign-off)
1. Add the `measured-lidar` + `derived-ordinance` rungs + the `unknown` (null + typed reason) rung to
   `resolveContextHeight`; map every rung to a C62 `DomainConfidence`.
2. Render the `unknown` rung in the explicit unknown-height style (not a confident 9 m solid).
3. Wire H2 (LiDAR/DSM join) + H3 (ordinance height) per city, cheapest city first.
4. Add the CI fidelity gate (§3).
5. Per-city H1 probe → H5 verification.
Fast-but-wrong REJECTED: retune `DEFAULT_BUILDING_HEIGHT_M` to a "better" guess — the defect is
fabrication-presented-as-fact, not the specific number.

## 6 — Cross-references
Audit **L-646** · L-459 (provenance shipped) · L-525 (BCN ordinance-height gap) · L-616 (unknown≠
maximally-permissive, envelope sibling) · C62 · C12 · C58 §1.2 · `ENVELOPE-REPLICATION-STANDARD.md` ·
`GEO-DATA-SOURCING-MASTER.md` · `apps/editor/src/ui/geospatial/contextBuildings.ts` (`resolveContextHeight`).
