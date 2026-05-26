# SPEC — Apartment Layout Constraint Database (BIM 3.0)

- **Status:** v1.0 — authoritative reference. **248 engineering constraints across 14 categories.**
- **Source standards:** UK Building Regulations (Parts A/B/E/F/G/H/J/K/L/M/O/P), London Plan / GLA, HQI UK, BS 8233 / 8300 / 6222 / 6465 / 5839 / 6700 / 3379, BRE Digest 209/309, BRE Site Layout Planning, CIBSE Guide A/B/G/LG10/TM59, NKBA, IEE 18th Edition, BS EN 1991-1-1, IGE UP/2, Water Regs 1999, ISO 16739 (IFC4), Space Syntax (Hillier & Hanson 1984).
- **Implements as code (single source of truth, partial):** [`packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts`](../../../../packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts).
- **Companion SPECs:** [SPEC-ARCHITECTURAL-PROGRAM-RULES](./SPEC-ARCHITECTURAL-PROGRAM-RULES.md) (the connectivity + program subset that drives the engine today), [SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE](./SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md) (where constraints are enforced in the P1→P9 pipeline), [SPEC-FURNITURE-LAYOUT-ENGINE](./SPEC-FURNITURE-LAYOUT-ENGINE.md).
- **Conflict order:** VISION → ARCHITECTURE → C-contracts → this SPEC → code. When code disagrees, fix code (or supersede this SPEC).

---

## 1. Purpose

This database is the **normative engineering reference** for the apartment layout
engine. Every layout the engine emits must be checked against it (currently a
partial subset is enforced at generation time; the rest are validation-time gates
or tracked as future work). Severity bands:

- **Mandatory** — a violation rejects the layout. UK Building Regs / London Plan / BS / Part-M legal floor.
- **Recommended** — a violation lowers the Pareto score (penalty), does not reject.
- **Info** — reference value, not a constraint.

The engine encodes these constraints at six layers (the architect's six-layer
model, see C16):

| Layer | What it enforces | TGL phase / D-FLE site |
|-------|------------------|------------------------|
| 1 — **Area ratios** | Gross zone splits + min NIA benchmarks | P2 `bubbleGraph` (weights + counts) |
| 2 — **Minimum sizes** | Per-room area + clear dimensions | P3 `squarify` clamp + V1 `validate` |
| 3 — **Adjacency / door topology** | Legal door connections + privacy caps | P4 `wallsAndDoors` reconciliation + V8/V9 `validate` |
| 4 — **Furniture placement** | Bed clearances, work triangle, fixture offsets | D-FLE `placeSolver` + post-place validator |
| 5 — **Structural + services** | Wet stacks, load alignment, MEP shaft, fall gradients | P1 `rectDecomposition` rect tagging |
| 6 — **Acoustic + fire + thermal** | Bedroom adjacency penalties, escape distances, U-values | P7 `objectives` penalties + future modules |

---

## 2. Constraint categories — summary

| # | Category | Count | Severity mix | Implemented in code | Status |
|---|----------|------:|--------------|---------------------|--------|
| 1 | Area Ratios | 19 | 6 Mandatory + 13 Recommended | `programRules.areaWeight` + `scaleProgramToShell` + auto-ensuite ≥3 beds | **Partial** — gross splits Recommended-only; NIA benchmarks tracked, not enforced |
| 2 | Room Sizes | 49 | 38 Mandatory + 10 Recommended + 1 Info | `programRules.minAreaM2` + `.minShortSideM` + V1 `validate` | **Partial** — minima enforced; clear-dimension and aspect rules tracked |
| 3 | Door Topology | 22 | 11 Mandatory + 7 Recommended + 4 Info | `programRules.accessFrom` + `.maxDoors` + P4 hard-reject + V8/V9 | **Largely complete** |
| 4 | Furniture Placement | 43 | 24 Mandatory + 12 Recommended + 7 Info | D-FLE `placeSolver` + `footprints.clearFront/clearSides` | **Partial** — basic clearances + anchors only |
| 5 | Daylighting | 13 | 7 Mandatory + 5 Recommended + 1 Info | P7 `objectives.daylight` (proxy) | **Future** — needs window placement on perimeter |
| 6 | Acoustic | 10 | 7 Mandatory + 3 Recommended | `programRules.accessFrom` blocks bed↔kitchen door; bed↔kitchen wall-adjacency penalty | **Future** — wall-adjacency penalty in P7 |
| 7 | Structural | 10 | 9 Mandatory + 1 Info | (none yet — load-bearing alignment not modelled) | **Future** — P1 rect tagging for load lines |
| 8 | Services (MEP) | 25 | 22 Mandatory + 3 Recommended | (none yet) | **Future** — wet stacking + electrical zones |
| 9 | Fire Safety | 9 | 9 Mandatory | (none yet — travel distance not measured) | **Future** — Part B compliance checker |
| 10 | Thermal / Energy | 12 | 11 Mandatory + 1 Recommended | (none — building-envelope concern) | **Out of scope** for layout phase |
| 11 | Space Syntax | 7 | 7 Recommended | P6 `spaceSyntax` (integration + mean depth) | **Complete** — Hillier & Hanson model |
| 12 | Accessibility | 11 | 11 Mandatory | (none yet) | **Future** — Part M M4(1/2/3) checker |
| 13 | IFC / BIM | 12 | 9 Mandatory + 2 Recommended + 1 Info | P5 `semanticGraph` (IfcSpace/Wall/Door/Window + deterministic GUIDs) | **Complete** |
| 14 | Outdoor / Amenity | 6 | 6 Mandatory | (none yet) | **Future** — balcony scoring |

**Implementation coverage today:** layers 2, 3, 11, 13 largely covered; layers 1, 4 partial; layers 5-10, 12, 14 documented and tracked, not yet enforced.

---

## 3. Full table (248 constraints)

### Category 1 — Area Ratios (19)

| # | Subcategory | Room | Constraint | Value | Unit | Standard | Severity |
|--:|-------------|------|------------|------:|------|----------|----------|
| 001 | Gross Distribution | All | Living/dining/kitchen combined | 30–40 | % net area | ISO 9836 | Recommended |
| 002 | Gross Distribution | All | Bedrooms total | 35–45 | % net area | ISO 9836 | Recommended |
| 003 | Gross Distribution | All | Bathrooms total | 8–14 | % net area | ISO 9836 | Recommended |
| 004 | Gross Distribution | All | Corridors and circulation | 8–12 | % net area | ISO 9836 | Recommended |
| 005 | Gross Distribution | All | Storage and utility combined | 3–6 | % net area | ISO 9836 | Recommended |
| 006 | Gross Distribution | All | Entrance hall / lobby | 2–4 | % net area | ISO 9836 | Recommended |
| 007 | Gross Distribution | All | Wall thickness loss (gross vs net) | 12–18 | % loss | ISO 9836 | Info |
| 008 | Room Count Ratios | All | Min bathrooms per bedrooms | 1 per 2 | ratio | HQI UK | **Mandatory** |
| 009 | Room Count Ratios | All | Ensuite required if ≥3 bedrooms | 1 ensuite | boolean | HQI UK | Recommended |
| 010 | Room Count Ratios | All | Separate WC required if ≥2 bathrooms | 1 WC | boolean | Building Regs Part G | Recommended |
| 011 | Room Count Ratios | All | Utility room required above threshold | 80 | m² | HQI UK | Recommended |
| 012 | Room Count Ratios | All | Max bedrooms before second WC mandatory | 3 | bedrooms | HQI UK | **Mandatory** |
| 013 | NIA Benchmarks | Studio | Studio apartment minimum NIA | 37 | m² | London Plan / GLA | **Mandatory** |
| 014 | NIA Benchmarks | 1-Bed | 1-bedroom flat minimum NIA | 50 | m² | London Plan / GLA | **Mandatory** |
| 015 | NIA Benchmarks | 2-Bed | 2-bedroom flat (3-person) minimum NIA | 61 | m² | London Plan / GLA | **Mandatory** |
| 016 | NIA Benchmarks | 2-Bed | 2-bedroom flat (4-person) minimum NIA | 70 | m² | London Plan / GLA | **Mandatory** |
| 017 | NIA Benchmarks | 3-Bed | 3-bedroom flat (5-person) minimum NIA | 86 | m² | London Plan / GLA | **Mandatory** |
| 018 | NIA Benchmarks | 4-Bed | 4-bedroom flat (6-person) minimum NIA | 95 | m² | London Plan / GLA | **Mandatory** |
| 019 | NIA Benchmarks | All | Built-in storage per person | 1.0 | m²/person | HQI UK | **Mandatory** |

**Engine mapping:**
- DB-008 / DB-012 — implemented by `scaleProgramToShell` (`⌈bedrooms/2⌉` baths, cap 4).
- DB-009 — implemented (`masterEnSuite` auto-enabled at ≥3 bedrooms).
- DB-013 to DB-018 — **tracked**; not yet enforced. Should reject when stated `bedrooms` is incompatible with shell area.
- DB-001 to DB-007 — **tracked** as gross-split targets; not yet validated.

### Category 2 — Room Sizes (49)

| # | Subcategory | Room | Constraint | Value | Unit | Standard | Severity |
|--:|-------------|------|------------|------:|------|----------|----------|
| 020 | Bedrooms | Master Bedroom | Net floor area minimum | 12 | m² | Building Regs | **Mandatory** |
| 021 | Bedrooms | Master Bedroom | Net floor area recommended | 16–20 | m² | HQI UK | Recommended |
| 022 | Bedrooms | Master Bedroom | Minimum clear width | 2.75 | m | Building Regs | **Mandatory** |
| 023 | Bedrooms | Master Bedroom | Minimum clear length | 3.2 | m | HQI UK | Recommended |
| 024 | Bedrooms | Master Bedroom | Max aspect ratio (W:L) | 1:2.0 | ratio | HQI UK | **Mandatory** |
| 025 | Bedrooms | Master Bedroom | Ceiling height minimum | 2.4 | m | Building Regs Part A | **Mandatory** |
| 026 | Bedrooms | Double Bedroom | Net floor area minimum | 11.5 | m² | Building Regs | **Mandatory** |
| 027 | Bedrooms | Double Bedroom | Net floor area recommended | 12–14 | m² | HQI UK | Recommended |
| 028 | Bedrooms | Double Bedroom | Minimum clear width | 2.6 | m | Building Regs | **Mandatory** |
| 029 | Bedrooms | Double Bedroom | Minimum clear length | 3.0 | m | HQI UK | **Mandatory** |
| 030 | Bedrooms | Single Bedroom | Net floor area minimum | 7.5 | m² | Building Regs | **Mandatory** |
| 031 | Bedrooms | Single Bedroom | Minimum clear width | 2.15 | m | Building Regs | **Mandatory** |
| 032 | Bedrooms | Single Bedroom | Minimum clear length | 2.5 | m | HQI UK | **Mandatory** |
| 033 | Bedrooms | Child Bedroom | Net floor area minimum | 7.0 | m² | Building Regs | **Mandatory** |
| 034 | Bedrooms | Child Bedroom | Max occupancy per area band | 2 | persons | HHSRS | **Mandatory** |
| 035 | Bathrooms | Full Bathroom | Net floor area minimum | 5.0 | m² | BS 8300 | **Mandatory** |
| 036 | Bathrooms | Full Bathroom | Net floor area recommended | 6–8 | m² | HQI UK | Recommended |
| 037 | Bathrooms | Full Bathroom | Minimum clear width | 1.8 | m | BS 8300 | **Mandatory** |
| 038 | Bathrooms | Full Bathroom | Minimum clear length | 2.5 | m | BS 8300 | **Mandatory** |
| 039 | Bathrooms | Shower Room | Net floor area minimum | 3.5 | m² | BS 8300 | **Mandatory** |
| 040 | Bathrooms | Shower Room | Minimum clear width | 1.5 | m | BS 8300 | **Mandatory** |
| 041 | Bathrooms | WC Only | Net floor area minimum | 1.5 | m² | Building Regs Part M | **Mandatory** |
| 042 | Bathrooms | WC Only | Minimum width | 0.9 | m | Building Regs Part M | **Mandatory** |
| 043 | Bathrooms | WC Only | Minimum length | 1.5 | m | Building Regs Part M | **Mandatory** |
| 044 | Bathrooms | Accessible Bathroom | Net floor area minimum M4(2) | 4.5 | m² | BS 8300 / Part M | **Mandatory** |
| 045 | Bathrooms | Accessible Bathroom | Wheelchair turning circle | 1500 | mm ⌀ | BS 8300 | **Mandatory** |
| 046 | Bathrooms | Accessible Bathroom | Transfer space beside WC | 750 | mm/side | BS 8300 | **Mandatory** |
| 047 | Living Areas | Living Room | Net floor area minimum | 14 | m² | HQI UK | **Mandatory** |
| 048 | Living Areas | Living Room | Net floor area recommended | 20–28 | m² | HQI UK | Recommended |
| 049 | Living Areas | Living Room | Minimum clear width | 3.2 | m | HQI UK | **Mandatory** |
| 050 | Living Areas | Living Room | Minimum clear length | 4.5 | m | HQI UK | Recommended |
| 051 | Living Areas | Living Room | Ceiling height minimum | 2.4 | m | Building Regs | **Mandatory** |
| 052 | Living Areas | Kitchen | Net floor area minimum (galley) | 6.0 | m² | HQI UK | **Mandatory** |
| 053 | Living Areas | Kitchen | Net floor area recommended | 10–14 | m² | HQI UK | Recommended |
| 054 | Living Areas | Kitchen | Minimum clear aisle (galley) | 1.0 | m | BS 6222 | **Mandatory** |
| 055 | Living Areas | Kitchen | Minimum clear aisle (island) | 1.2 | m | BS 6222 | **Mandatory** |
| 056 | Living Areas | Kitchen | Minimum counter run length | 2.4 | m | BS 6222 | Recommended |
| 057 | Living Areas | Kitchen | Counter depth standard | 600 | mm | BS 6222 | **Mandatory** |
| 058 | Living Areas | Kitchen | Counter height standard | 870–920 | mm | BS 6222 | Recommended |
| 059 | Living Areas | Kitchen-Dining | Combined minimum area | 14 | m² | HQI UK | **Mandatory** |
| 060 | Living Areas | Dining Room | Net floor area minimum (separate) | 9 | m² | HQI UK | **Mandatory** |
| 061 | Living Areas | Dining Room | Clearance around dining table | 800 | mm min | HQI UK | Recommended |
| 062 | Circulation | Main Corridor | Clear width minimum | 1000 | mm | Building Regs Part M | **Mandatory** |
| 063 | Circulation | Main Corridor | Clear width recommended | 1200 | mm | HQI UK | Recommended |
| 064 | Circulation | Secondary Corridor | Clear width minimum | 900 | mm | Building Regs Part M | **Mandatory** |
| 065 | Circulation | Entrance Hall | Net floor area minimum | 2.5 | m² | HQI UK | **Mandatory** |
| 066 | Circulation | Entrance Hall | Net floor area recommended | 4–6 | m² | HQI UK | Recommended |
| 067 | Circulation | Storage | Built-in storage minimum per person | 1.0 | m² | HQI UK | **Mandatory** |
| 068 | Circulation | Utility Room | Net floor area minimum | 3.5 | m² | HQI UK | Recommended |

**Engine mapping** (the values pinned in `programRules.ts`):
- DB-020 master 12 m² ✓ + DB-022 width 2.75 m ✓
- DB-026 double bedroom 11.5 m² ✓ + DB-028 width 2.6 m ✓
- DB-035 bathroom 5 m² ✓ + DB-037 width 1.8 m ✓
- DB-039 ensuite/shower-room 3.5 m² ✓ + DB-040 width 1.5 m ✓
- DB-047 living 14 m² ✓ + DB-049 width 3.2 m ✓
- DB-052 kitchen 6 m² ✓ + 1.8 m short side
- DB-060 dining 9 m² ✓
- DB-062 corridor 1.0 m clear ✓
- DB-065 hall 2.5 m² ✓
- DB-068 utility 3.5 m² ✓
- DB-021 / DB-024 / DB-025 / DB-029 / DB-034 / DB-038 / DB-050 / DB-051 / DB-058 / DB-061 — **tracked, not enforced** (ceiling height, max aspect, clear length recommended).

### Category 3 — Door Topology (22)

| # | Subcategory | Room | Constraint | Value | Unit | Standard | Severity |
|--:|-------------|------|------------|------:|------|----------|----------|
| 069 | Bedroom Doors | Bedroom | Must open directly onto | Corridor / landing | adjacency | HQI / Fire Regs | **Mandatory** |
| 070 | Bedroom Doors | Bedroom | Must NOT open into | Kitchen / WC | adjacency | HQI UK | **Mandatory** |
| 071 | Bedroom Doors | Bedroom | Door clear opening width minimum | 775 | mm | Part M | **Mandatory** |
| 072 | Bedroom Doors | Bedroom | Door swing clear space | 900 | mm | HQI UK | **Mandatory** |
| 073 | Bedroom Doors | Bedroom | Door must not face open WC | true | boolean | HQI UK | Recommended |
| 074 | Bedroom Doors | Bedroom | Door must not face directly into living room | true | boolean | HQI UK | Recommended |
| 075 | Bedroom Doors | Bedroom | Max depth from entrance (Space Syntax) | 3 | steps | Space Syntax | Recommended |
| 076 | Bathroom Doors | Bathroom | Legal connections | Corridor OR bedroom | adjacency | Building Regs | **Mandatory** |
| 077 | Bathroom Doors | Ensuite | Ensuite door inside bedroom boundary | true | boolean | HQI UK | **Mandatory** |
| 078 | Bathroom Doors | WC | WC not visible from entrance when open | true | boolean | HQI UK | **Mandatory** |
| 079 | Bathroom Doors | Bathroom | Inward swing standard; outward if <3.5 m² | inward preferred | direction | Building Regs | Recommended |
| 080 | Bathroom Doors | Bathroom | Sliding-door clear opening maintained | 775 | mm | Part M | Recommended |
| 081 | Kitchen Doors | Kitchen | Must connect to | Living/dining OR hall | adjacency | HQI UK | **Mandatory** |
| 082 | Kitchen Doors | Kitchen | NOT the only route to bedroom/bathroom | true | boolean | Fire Regs Part B | **Mandatory** |
| 083 | Kitchen Doors | Kitchen | Fire door if open-plan and >4.5 m from exit | FD30 | fire rating | Part B | **Mandatory** |
| 084 | Living Room Doors | Living Room | Should connect to | Hall AND kitchen/dining | adjacency | HQI UK | Recommended |
| 085 | Living Room Doors | Living Room | No bedroom accessed through living room | true | boolean | HQI / Privacy | **Mandatory** |
| 086 | Living Room Doors | Living Room | Space Syntax integration rank | ≥ 2nd most integrated | rank | Space Syntax | Recommended |
| 087 | Entrance | Entrance Hall | Must be first space from front door | true | boolean | HQI UK | **Mandatory** |
| 088 | Entrance | Entrance Hall | Front door clear opening width | 900 | mm | Part M | **Mandatory** |
| 089 | Entrance | Entrance Hall | Level threshold at front door | 15 | mm max | Part M M4(2) | **Mandatory** |
| 090 | Entrance | Entrance Hall | All rooms reachable from entrance in max steps | 3 | steps | Space Syntax | Recommended |

**Engine mapping:**
- DB-069, DB-070, DB-082, DB-085 — implemented via `accessFrom` matrix (`bedroom.accessFrom = [corridor, living, dining]`; `bathroom.accessFrom = [corridor, bedroom, master]`; kitchen excludes wet rooms; bedroom excludes other bedrooms). Hard-rejected by P4 phase 2b.
- DB-076 — implemented (`bathroom.accessFrom`).
- DB-077 — implemented (`ensuite.accessFrom = [master]`).
- DB-081 — **DEFERRED to user preference**: the constraint DB allows hall→kitchen; the user's explicit rule restricts hall to `[living, corridor]` only. Current engine follows the user's stricter rule; the DB-allowed permission could be re-enabled when a "permissive hall" mode is configured.
- DB-075 / DB-090 — P6 `spaceSyntax` computes mean depth; not currently used as a hard reject.
- DB-071 / DB-072 / DB-073 / DB-074 / DB-078 / DB-079 / DB-080 / DB-083 / DB-086 / DB-087 / DB-088 / DB-089 — **tracked, not yet enforced** (door clear-widths + sightline + fire-rating + level-threshold).

### Category 4 — Furniture Placement (43)

The full furniture rules are encoded in the D-FLE `placeSolver` (anchor + clearFront/clearSides per footprint) and the archetypes. Highlights:

| # | Subcategory | Constraint | Value | Engine |
|--:|-------------|------------|------:|--------|
| 091 | Bed | Bed head against solid wall | true | D-FLE `anchor: 'wall-opposite-door'` |
| 092 | Bed | Clear each side of double bed | 600 mm | `footprint.clearSides` |
| 093 | Bed | Clear at foot of bed | 800 mm | `footprint.clearFront` |
| 094 | Bed | Bed must not block window egress | true | **tracked** |
| 095 | Bed | Power outlets per side | 1 double | (out of scope) |
| 096-098 | Wardrobe | Depth 600 / width ≥1200 / dressing clearance 900 | mm | partial |
| 099-102 | Bed | Standard sizes (king/super-king/double/single) | mm | `footprints.bed` |
| 103-113 | Bathroom | WC / basin / shower / bath dimensions + clearances | mm | partial (toilet_radiator + shower_glass_panel) |
| 114-129 | Kitchen | Work triangle, hob clearance, fridge spacing, landing zones | mm | **partial** (kitchen_l_shape footprint only) |
| 130-133 | Living | Sofa clearances, TV wall, circulation 900 mm | mm | partial |

**Status:** D-FLE encodes anchors + per-item clearances. The full constraint set (work triangle, hob-window prohibition, fixture wall co-location, electrical zones) is tracked as future-work in [SPEC-FURNITURE-LAYOUT-ENGINE](./SPEC-FURNITURE-LAYOUT-ENGINE.md).

### Category 5 — Daylighting (13)

| # | Subcategory | Constraint | Value | Status |
|--:|-------------|------------|------:|--------|
| 134 | Window Area | Window area ≥ 10% floor area (habitable) | % | **tracked** |
| 135 | Window Area | Openable area ≥ 5% floor area | % | **tracked** |
| 136-138 | Daylight Factor | Habitable DF ≥ 1.0% (living 1.5%, kitchen 2.0%) | % DF | **tracked** |
| 139 | Bathroom Ventilation | Natural light OR 6 ACH mechanical | either | **tracked** |
| 140-143 | Solar Orientation | Bedroom E/S; Living S/W; Kitchen N/E | cardinal | **future** (needs perimeter facing) |
| 144 | Overshadowing | Min separation between facing windows 18 m | m | **future** (site-level) |
| 145 | Overshadowing | 25° rule | ° | **future** |
| 146 | Overshadowing | Annual probable sunlight hours ≥25% APSH | % | **future** |

P7 `objectives.daylight` is a proxy (habitable room fronts the facade); the full BRE Digest 309 daylight-factor calculation is future work.

### Category 6 — Acoustic (10)

| # | Subcategory | Constraint | Value | Status |
|--:|-------------|------------|------:|--------|
| 147 | Party Elements | Airborne wall ≥45 dB Rw | dB | (envelope) |
| 148 | Party Elements | Impact floor ≤62 dB Lnw | dB | (envelope) |
| 149 | Internal Partitions | Bedroom↔living airborne ≥40 dB Rw | dB | **tracked** |
| 150 | Room Adjacency | **Bedroom must NOT adjoin kitchen on shared wall** | boolean | **future** — P7 penalty |
| 151 | Room Adjacency | **Bedroom must NOT adjoin living without acoustic separation** | boolean | **future** — P7 penalty |
| 152 | Room Adjacency | Bathroom NOT directly above bedroom (no acoustic floor) | boolean | (multi-floor) |
| 153 | Room Adjacency | Plant/lift NOT adjacent to bedroom | boolean | (services) |
| 154 | Ambient Noise | Bedroom night ≤30 dB LAeq | dB | (acoustic sim) |
| 155 | Ambient Noise | Living day ≤35 dB LAeq | dB | (acoustic sim) |
| 156 | Ambient Noise | Acoustic lobby if corridor >50 dB | boolean | (envelope) |

DB-150 / DB-151 are the **single most-important** acoustic constraints for layout: they're a wall-adjacency penalty (different from the door-permission matrix — two rooms can be adjacent without sharing a door). Slated for P7 `objectives` penalty injection.

### Category 7 — Structural (10)

| # | Subcategory | Constraint | Value | Status |
|--:|-------------|------------|------:|--------|
| 157 | Wall Layout | Load-bearing walls align floor-to-floor | boolean | **future** — multi-storey concern |
| 158 | Wall Layout | Acoustic partition thickness | 100 mm | engine default 100 mm ✓ |
| 159 | Wall Layout | Non-acoustic partition | 75 mm | (configurable) |
| 160 | Wall Layout | External wall + insulation | 250–350 mm | (envelope) |
| 161 | Wall Layout | Wet room wall block ≥100 mm | mm | (specification) |
| 162 | Spans | Max flat-slab span without beam (resi) | 8.0 m | **future** — P1 rect constraint |
| 163 | Spans | Residential structural grid | 3.6–5.4 m | Info |
| 164-166 | Floor Loading | Resi 1.5 kN/m²; kitchen/bath 2.0 kN/m² | kN/m² | (structural sim) |

### Category 8 — Services (MEP) (25)

| # | Subcategory | Constraint | Value | Status |
|--:|-------------|------------|------:|--------|
| 167 | Plumbing | **Wet rooms stacked vertically across floors** | boolean | **future** — multi-floor |
| 168 | Plumbing | Soil pipe max horizontal run to stack | 6000 mm | **future** |
| 169 | Plumbing | Soil pipe min fall gradient | 1:40 | (services) |
| 170-172 | Plumbing | Pipe size / hot-water time / shower flow | various | (services) |
| 173-175 | Ventilation | Extract rates: kitchen 60 / bath 15 / WC 6 L/s | L/s | (services) |
| 176-178 | Ventilation | Trickle vents 8000 mm² EFA; MVHR duct ≤8 m | mm² | (services) |
| 179-188 | Electrical | Consumer unit / sockets / circuits / IEE zones | various | (services) |
| 189-191 | MEP Shaft | Central shaft ≥600×600 mm; gas meter location | mm | **future** — shaft slot in P1 |

### Category 9 — Fire Safety (9)

| # | Subcategory | Constraint | Value | Status |
|--:|-------------|------------|------:|--------|
| 192 | Escape Routes | Max travel to front door (single stair) | 4500 mm | **future** — P6 path length |
| 193 | Escape Routes | Protected entrance hall ≥3 storeys | boolean | (multi-storey) |
| 194 | Escape Routes | Open-plan kitchen FD30 / suppression if on escape route | FD30 | **tracked** |
| 195 | Escape Routes | Escape window if no protected route | 450×450 mm | **tracked** |
| 196-198 | Detection | Smoke alarm placement + interlinked + heat in kitchen | boolean | (services) |
| 199-200 | Door Ratings | Front door FD30S; protected-hall internal FD20 | rating | (specification) |

### Category 10 — Thermal / Energy (12)

U-values, overheating (CIBSE TM59 / Part O), heating design temps. **Out of scope** for the layout phase — envelope concerns. Tracked for cross-discipline export.

### Category 11 — Space Syntax (7)

| # | Subcategory | Constraint | Value | Engine |
|--:|-------------|------------|------:|--------|
| 213 | Integration | Living rank in plan (most accessible) | 1st or 2nd | P6 ✓ |
| 214 | Integration | Kitchen rank | 2nd or 3rd | P6 ✓ |
| 215 | Integration | Bedroom rank (most segregated) | Lowest | P6 ✓ |
| 216 | Integration | Bathroom rank | 2nd lowest | P6 ✓ |
| 217 | Connectivity | Corridor min connections | 3 | P6 + P4 |
| 218 | Connectivity | Max mean depth from entrance | 4 steps | P6 ✓ |
| 219 | Connectivity | Relative asymmetry target | ≤0.4 | P6 ✓ |

P6 `spaceSyntax.ts` (Hillier & Hanson 1984) computes per-space integration + mean depth + RA. P7 `objectives.circulation` rewards public-shallow / private-deep gradients. **Largely complete.**

### Category 12 — Accessibility (11)

Part M categories M4(1) Visitable, M4(2) Accessible/Adaptable, M4(3) Wheelchair User. Activity space (900×1200), door handle / switch heights, thresholds ≤13 mm. **Future** — Part M checker.

### Category 13 — IFC / BIM (12)

| # | Subcategory | Constraint | Engine |
|--:|-------------|------------|--------|
| 231 | IfcSpace per room | P5 `semanticGraph` ✓ |
| 232 | IfcWall / IfcWallStandardCase | P5 ✓ |
| 233 | IfcDoor | P5 ✓ |
| 234 | IfcWindow | P5 ✓ |
| 235 | IfcRelSpaceBoundary | (partial) |
| 236 | IfcZone grouping | **future** |
| 237-240 | Property sets (NetFloorArea, OccupancyType, AcousticRequirement, FireSafety) | partial |
| 241 | IfcGeometricRepresentationContext | (export-time) |
| 242 | GUID format (compressed) | `ifcGuid.ts` ✓ FNV-1a deterministic |

**Largely complete.** P10 IFC5/RDF export (full Pset_* writeback) is deferred to a downstream sprint.

### Category 14 — Outdoor / Amenity (6)

| # | Constraint | Value | Status |
|--:|------------|------:|--------|
| 243 | Private outdoor space per unit | 5 m² | **future** — balcony scoring |
| 244 | Balcony min usable depth | 1500 mm | **future** |
| 245 | Balcony guard rail height | 1100 mm | (specification) |
| 246 | Balcony floor load | 2.0 kN/m² | (structural) |
| 247 | Cycle storage per unit | 1/bedroom | (planning) |
| 248 | Bin store distance | (truncated in source) | **future** |

---

## 4. Forward roadmap — what gets enforced next

Priority order, weighted by user-visible defect impact:

1. **DB-013 to DB-018 — NIA benchmarks** as a `validate` reject when the program is incompatible with the shell area (e.g. 3 bedrooms in 60 m²).
2. **DB-150 / DB-151 — bedroom↔kitchen and bedroom↔living wall-adjacency** as a P7 acoustic penalty (the next clear layout-quality leap after the door-permission matrix).
3. **DB-024 — bedroom max aspect 1:2.0** as a P3 squarify reject (the long-thin-bedroom defect).
4. **DB-114 to DB-128 — kitchen work triangle + hob clearances** as a D-FLE post-place validator.
5. **DB-167 — wet-room vertical stacking** for multi-floor projects (P1 rect tagging).
6. **DB-090 — every room reachable from entrance in ≤3 steps** as a P6/P7 hard reject (Space Syntax).

Each of these maps cleanly to an existing TGL phase; the database row + standard citation is the test fixture.

---

## 5. Change control

This SPEC is **the** layout-constraint reference. Adding / changing a constraint:

1. Add the row here with a stable DB-NNN id (do not renumber existing rows).
2. Cite the source standard (Building Regs Part / BS / HQI / etc.).
3. Cross-reference the implementing function in `programRules.ts` or the relevant phase file.
4. If `Mandatory`, add a test asserting the rejection condition.
