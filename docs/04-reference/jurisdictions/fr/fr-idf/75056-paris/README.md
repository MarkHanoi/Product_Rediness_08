# Paris (`75056`) — Jurisdiction Pack

**Country:** `fr` · **Region:** Île-de-France (`fr-idf`) · **INSEE:** `75056` ·
**Governing document:** PLU bioclimatique de Paris (1 commune) ·
**Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED

---

## Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **Zoning identification** | RESEARCH COMPLETE — endpoint confirmed, not live-probed | Live GPU probe → zone code + document link for a Paris parcel |
| **Context data (LOD1)** | RESEARCH COMPLETE — BD TOPO endpoint confirmed, not live-probed | Live BD TOPO probe → `HAUTEUR` field non-null |
| **Rule pack — zone `UG`** | NOT STARTED | ADR-0274 (reference-surface + gabarit kind) ratified |
| **Rule pack — zone `UGSU`** | NOT STARTED | `UG` pack shipped first |
| **Rule pack — zone `UV`** | NOT STARTED | `UG` pack shipped |
| **Rule pack — zone `N`** | NOT STARTED | `UG` pack shipped |
| **Overlay: SUP (flood, aviation)** | NOT STARTED | GPU SUP layer probe |
| **Overlay: ABF perimeters** | NOT STARTED — ABF perimeters NOT returned by base GPU zone query | ABF SUP sub-type confirmed in GPU response |
| **Overlay: PSMV / secteur sauvegardé** | NOT STARTED — PSMV NOT visible in base GPU zone query | Separate PSMV layer probe |

**Overall status: NOT STARTED (research phase complete).**

---

## Zone taxonomy

Paris uses a **strikingly compressed** zone taxonomy — only 4 zone types citywide. Real spatial variation is expressed through sectors, graphic plans, and overlay mechanisms layered on `UG`, not by proliferating zone codes.

| Zone code | French label | Character | Dominant use | Coverage (approx.) |
|---|---|---|---|---|
| **`UG`** | Zone Urbaine Générale | The main urban fabric — all building types | Mixed urban | **Dominant** — covers the large majority of Paris private land |
| **`UGSU`** | Zone Urbaine Générale — Services Urbains | Major infrastructure, utilities, rail yards | Functional | Minor area |
| **`UV`** | Zone Urbaine de Végétation | Parks, gardens, green corridors | Vegetation-dominant | Minor area |
| **`N`** | Zone Naturelle | Bois de Boulogne, Bois de Vincennes | Natural | Perimeter forests |

**Practical implication:** a single `UG` pack captures most of Paris. But `UG`'s height-envelope rules are more complex than any Barcelona clau examined to date.

---

## Height mechanism (the core engineering challenge)

**Paris does NOT use a street-width height table.** The mechanism is two layered constructions:

### Layer 1 — hauteur plafond (ceiling height from graphic plan)

A city-wide "plan des hauteurs" (graphic plan) sets a **hauteur plafond** (ceiling height) per
graphic sector. The numeric ceiling is read off this map, not from a text table.

- The ceiling is measured from the **"surface de nivellement de l'îlot"** — a computed
  block-level leveling surface. This is NOT street level, NOT sea level, and NOT average lot
  elevation. It is derived from surrounding block geometry: a geometric construction that
  PRYZM must compute before applying the ceiling. This is a new kind.
- **UNVERIFIED: whether the "plan des hauteurs" is published as a machine-readable GIS layer**
  (WMS/WFS on `api-sig.paris.fr`) or only as scanned "atlas des planches au 1/2000" PDF
  plates. This probe changes the Paris estimate by 6–8 dev-days.

**Typical ceiling values in `UG`:** ~12–25 m (4–8 storeys), varying by sector.

### Layer 2 — gabarit-enveloppe (fill formula given the ceiling)

Even within the graphic ceiling, the building must satisfy a gabarit (oblique massing rule)
that governs how the volume fills outward from the facade. From PLU bioclimatique article UG.10
(exact wording must be read verbatim — do not rely on this paraphrase):

- **Street facade:** oblique from the street alignment at 1:1 from a break point at the
  hauteur de façade. The facade terminates at a hauteur de façade lower than the ceiling;
  above it, a slope governs the roof zone.
- **Side boundary — setback H = P + 3.00 + D** (where P = prospect/setback distance measured
  horizontally from the boundary, D = depth of the adjacent building's back face, D ≤ 6 m).
- **Vis-à-vis facades — H = P + 4.00** with a 1:1 oblique.

This formula is a function of **prospect distance** (setback), not street width. It makes the
envelope a function of the lot's shape relative to its neighbours — a parametric construction,
not a lookup.

**Engine requirement:** a new `GeometricRule` kind that:
1. Computes the block-level reference surface (surface de nivellement de l'îlot) from
   surrounding parcel geometry.
2. Reads the graphic ceiling from the hauteur plafond layer.
3. Applies the prospect-formula gabarit to each facade independently.
4. Returns the intersection of (2) and (3) as the buildable envelope.

This is ADR-0274 territory. Write the ADR by reading UG.10.1–10.4 verbatim first.

---

## Setback / implantation rules (UG)

Articles UG.6, UG.7, UG.8 (must be read verbatim before any implementation):

| Rule | Mechanism | Note |
|---|---|---|
| UG.6 — implantation/voies | Alignment to the road easement (limites d'emprise) or setback | Standard French article structure |
| UG.7 — implantation/limites séparatives | H = P + 3.00 + D formula (see above) at side/rear boundaries | Same formula as the gabarit — not a separate number |
| UG.8 — implantation of buildings to each other on same lot | H = P + 4.00 vis-à-vis rule | Same parametric approach |

---

## FAR (emprise au sol / surface de plancher)

| Field | Value | Instrument |
|---|---|---|
| **COS (old FAR)** | `n/a — abolished nationwide (loi ALUR 2014)` | Loi n° 2014-366 |
| **Emprise au sol (footprint coverage)** | **EMERGES from gabarit formulas** — not a stated percentage in `UG`. In `UV`/`N`, explicit limits are stated. | Articles UV.9, N.9 |
| **Surface de plancher (SDP)** | Not capped per parcel in `UG` — constrained by envelope only | — |

---

## Overlays

| Overlay | Source | Status | Risk |
|---|---|---|---|
| SUP flood / aviation | GPU SUP layer via `apicarto.ign.fr/api/gpu` | NOT probed | LOW — structurally queryable |
| **ABF perimeters** (500 m around classified monuments — ubiquitous in Paris) | GPU SUP layer — sub-type code TBD | NOT probed | **HIGH** — Paris has hundreds of classified monuments; a large fraction of private parcels are within 500 m of at least one; ABF overlay detection is mandatory before any Paris result is trustworthy |
| **PSMV** (Le Marais, 1er arr, 5e–7e historically) | NOT visible in base GPU zone query | NOT probed | **HIGH** — PSMV imposes a separate plan; any parcel in a secteur sauvegardé is covered by a PSMV, not the PLU bioclimatique |
| Paris "fuseaux de protection" (protection corridors) | Paris-specific graphic plans layered on UG | NOT probed | MEDIUM — specific sectors |
| Montmartre / maisons-villas secteurs | Paris-specific dispositions in PLU bioclimatique | NOT sourced | MEDIUM — affects designated sectors |

---

## Source hierarchy

| Data needed | Source | Confidence |
|---|---|---|
| Parcel geometry | IGN PCI Express / API Carto `apicarto.ign.fr/api/cadastre` | `corroborated` |
| Zone code → document | GPU API `apicarto.ign.fr/api/gpu` | `corroborated` |
| Zone rules (height, setback, emprise) | **PLU bioclimatique règlement écrit PDF** — obtained via GPU link, must be read verbatim for each article | NOT YET |
| hauteur plafond (ceiling value per sector) | **Plan des hauteurs** — GIS layer or PDF plates (TBD — MUST probe before scoping) | NOT YET |
| Context buildings + height | BD TOPO `data.geopf.fr/wfs` (`BDTOPO_V3:batiment`, field `HAUTEUR`) | `corroborated` (not live-probed) |
| ABF overlay | GPU SUP — sub-type code TBD | NOT YET |

---

## Development estimate

| Work item | Dev-days | Pre-condition |
|---|---|---|
| ADR-0274 — reference-surface + gabarit rule kind | ~4–5 | Read UG.10 verbatim first |
| Sourcing UG.6/7/8/10 verbatim from PLU text | ~4 | Download PLU PDF from GPU link |
| Implementation — rule evaluation for `UG` | ~10–12 | ADR-0274 ratified |
| Plan des hauteurs ingestion — graphic layer (if GIS) | ~4–5 | Probe `api-sig.paris.fr`; layer confirmed as GIS |
| Plan des hauteurs ingestion — if PDF plates only | +6–8 additional | Digitizing pipeline needed |
| ABF overlay detection | ~3 | GPU SUP probe + sub-type confirmation |
| PSMV carve-out (refusal) | ~2 | PSMV layer probe |
| **Total (dominant `UG` zone, GIS plan des hauteurs best case)** | **~24–29 d** | — |
| **Total (worst case — PDF plates only)** | **~31–37 d** | — |

`UGSU`, `UV`, and `N` are each separate sourcing tasks scoped independently after `UG` ships.

---

## Open questions

1. **Is the "plan des hauteurs" published as a GIS layer on `api-sig.paris.fr` / `opendata.paris.fr`?**
   Probe first. Name to search: `plan_hauteurs`, `hauteur_plafond`, `hauteurs_plafond`. If absent: GIS layer does not exist; switch to PDF-plate digitizing scope.
2. **Which GPU SUP sub-type code corresponds to ABF perimeters?** Probe the SUP layer for a
   Paris parcel known to be inside an ABF perimeter (e.g., near Sacré-Coeur or Notre-Dame) and
   inspect the type code in the response.
3. **Does the consolidated PLU bioclimatique text include all amendments, or must you track
   modifications separately?** Obtain the consolidated text from `api-sig.paris.fr` and check
   the "modificatif" history before sourcing any article values.

---

**Related files:** `../../README.md` (country umbrella) · `../../NEXT.md` (blockers + resume) ·
`../../findings/FRANCE-MASTER-DATA-SOURCE-STUDY.md §B.1` (full Paris analysis) ·
`sources/SOURCES.md` · `NEXT.md`
