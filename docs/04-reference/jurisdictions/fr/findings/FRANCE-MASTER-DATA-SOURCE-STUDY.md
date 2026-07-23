# France — MASTER DATA-SOURCE & RULE-MECHANISM STUDY

**Companion to and supersedes in detail the initial scoping note.** This document goes one level
deeper: for every requirement the Barcelona envelope card exposes, it separates **what is genuinely
national** (one source, one mechanism, works identically anywhere in France) from **what is
municipality/EPCI-specific** (a different legal mechanism — not just different numbers).

Three metros were studied in depth: **Paris**, **Lyon Métropole**, and **Aix-Marseille-Provence
(Marseille)**. Each implements height by a structurally different mechanism. This is the single most
important finding: do not assume any French city generalises to any other.

**Status:** research + scoping. No rule pack is implemented by this document.

---

## PART A — THE NATIONAL COMMON BASELINE

### A.1 Parcel identification and geometry

**National baseline:** every parcel in France carries a cadastral reference in the same structure
— commune INSEE code + section (1–2 letters) + parcel number — regardless of region.

| Source | Mechanism | Update cadence |
|---|---|---|
| IGN **Parcellaire Express (PCI)** | WFS `data.geopf.fr/wfs` or **API Carto — module cadastre** `apicarto.ign.fr/api/cadastre` | Semi-annual; explicitly recommended over the older BD Parcellaire (discontinued 2018) |
| **cadastre.data.gouv.fr** (Etalab/DGFiP) | Bulk GeoJSON/Shapefile per commune | Same underlying DGFiP source, repackaged |

**Known caveat, national:** parcel boundaries are not survey-precise — they are an imprecise
graphic representation predating high-precision aerial photography. Nationwide property; carry as
a standing caveat on all France geometry.

**§A.1.D Deviations:** none material. Paris, Lyon, and Marseille all resolve through the identical
PCI Express / API Carto path.

---

### A.2 Zoning identification — which document and zone code applies

**National baseline:** the **Géoportail de l'Urbanisme (GPU)** is the single national portal.
Since 1 January 2023, publication on this portal makes a PLU or SCoT legally executory
(ordonnance n° 2021-1310). Access:

- WFS: `data.geopf.fr/annexes/ressources/wfs/gpu.xml` (paginated, 5,000-object cap per request)
- Weekly bulk ATOM/GeoPackage extraction per CNIG standards
- **API Carto — module GPU:** `apicarto.ign.fr/api/gpu` — returns which regime governs a
  point/polygon, including PLU, PLUi, POS, carte communale, or RNU fallback

This tells you: the zone code, the governing document's name and approval date, and a link to
the written règlement. **This part is genuinely national and works identically everywhere.**

**What zone codes mean is NOT national.** `UA` in one EPCI and `UA` in a neighbouring one are
independent local mnemonics — there is no cross-reference table. This is the single largest
structural difference from Barcelona's clau system (which, while municipal, draws from one
metropolitan-wide taxonomy across all of Barcelona's zones).

**§A.2.D Deviations — document TYPE itself varies:**
- **Paris:** single-commune PLU (PLU bioclimatique), four zones citywide (`UG`, `UGSU`, `UV`, `N`)
  — a strikingly small taxonomy because real variation is pushed into sectors and graphic plans
  layered on `UG` rather than into more zone codes.
- **Lyon:** a **PLU-H** (Plan Local d'Urbanisme et de l'Habitat) — single intercommunal document
  covering all 58 communes of the Métropole, merging housing-policy content, in force June 2019.
- **Marseille:** covered by the **PLUi of the Métropole Aix-Marseille-Provence**, split into
  Conseils de Territoire. Marseille falls under "Territoire 1, Marseille-Provence" (approved
  19/12/2019); Aix-en-Provence falls under a separate PLUi ("Pays d'Aix", approved 5/12/2024).
  Two different intercommunal documents inside one metropolitan authority. The metropolitan
  authority explicitly warns that its published zoning layer is informational only and not legally
  opposable — the binding version is the PDF, not the GIS layer, throughout AMP.

---

### A.3 The legal hierarchy and default regime (RNU)

**National baseline:** the **Règlement National d'Urbanisme (RNU)** is the one truly uniform,
nationwide legal text, applying by default wherever no PLU/PLUi/carte communale exists. It is
qualitative rather than numeric-table-driven (requirements to respect surrounding character,
minimum servicing conditions) — a safety net, not a buildable-envelope formula.

Since the **loi ALUR (2014)**, the **COS** (coefficient d'occupation des sols — France's old
per-parcel FAR) was **abolished nationwide**. Density is now governed exclusively by height +
footprint + setback envelope. This is a genuine point of structural convergence with Barcelona's
`13a` pack (edificabilitat = envelope-derived volume, not a per-parcel FAR).

**Practically:** write `n/a — abolished nationwide (loi ALUR 2014)`, NOT `not derived`, for every
French pack's FAR field. "Not derived" implies a gap in the engine; "n/a" states a fact of French law.

**§A.3.D Deviations:** none in principle (ALUR's COS abolition is nationwide law). See §A.5.D for
how the practical substitute for density control differs city by city.

---

### A.4 Height — the mechanism itself varies, not just the numbers

**This is the central finding.** In Barcelona, "how is height expressed" has one answer: a table
keyed by amplada de vial (Art. 327.2). In France, the three cities studied use **three different
mechanisms**, none of which is a street-width table:

| City / EPCI | Height mechanism | Structured GIS data or PDF-only? |
|---|---|---|
| **Paris** | A graphic "plan des hauteurs" sets a *hauteur plafond* (ceiling height) per zone/sector, measured from a computed **"surface de nivellement de l'îlot"** (a block-level leveling surface, itself a derived geometric construction — not street level, not sea level). On top of that ceiling, a **gabarit-enveloppe** formula governs how the building may actually fill that ceiling: H = P + 3.00 + D at side boundary (P = prospect/setback distance, D ≤ 6 m), and H = P + 4.00 with a 1:1 oblique for vis-à-vis facades. **Two layered constructions, not one number.** | Low — graphic plates, PDF-bound; hauteur plafond may or may not be published as a GIS layer (unverified) |
| **Lyon Métropole** | Height is carried as a **structured attribute directly on the zoning GIS polygon** — fields `HBCPRINC` / `HBCSEC` (height in primary vs secondary buildable band) or a single `PLAFOND` field where the zone doesn't distinguish bands, with a separate coefficient d'emprise au sol per zone or block. **Exception inside Lyon and Villeurbanne:** heights are handled via separate **"périmètres de hauteurs de façades" overlay zones** instead of the polygon attribute. | High for outer 56 communes; low for Lyon/Villeurbanne (overlay zones) |
| **Marseille / AMP** | Explicit precedence rule stated in the règlement: *"le règlement graphique prime sur le règlement écrit des zones. Ainsi, à défaut d'indication sur le règlement graphique, c'est le règlement écrit des zones qui s'applique"* — the map wins; the text is a fallback only. Zone families (UA/UB/UC) carry storey-band descriptions (R+4–6 for UA, R+3–4 for UB, R+1–2 for UC) in the written text, but these are only the fallback; the graphic plan is the binding source. | Low — graphic plan is the primary source; whether it is machine-readable beyond zone code is unverified |

**Why this matters more than a parameter difference:** the existing `GeometricRule` schema has
`setback`, `alignment`, `block-derived-alignment`, and `explicit-area` kinds. None represents
"read a numeric ceiling off a published map layer, then apply a formula relative to a
separately-defined reference surface." Lyon's case is closest to something already representable
(`HBCPRINC`/`PLAFOND` are attribute lookups). Paris and Marseille's mechanisms are **new kinds**
in the same sense that Barcelona's clau 12 needed ADR-0273.

**Do not assume Lyon's structured attribute generalises to Paris or Marseille** — that is the
exact C58 §1.11 flattening error this study exists to prevent.

---

### A.5 Setbacks, implantation, and site coverage (emprise au sol)

**National baseline:** French règlements conventionally organize these under three recurring
article categories (a holdover from the old national R123-* article numbering, now recodified
but still echoed in most local drafting):
1. Implantation relative to roads/public ways
2. Implantation relative to side boundaries (limites séparatives)
3. Implantation of buildings relative to each other on the same lot

This three-way structural split is genuinely nationwide and recurs in most communes' drafting
even though article numbers differ.

**§A.5.D Deviations:**
- **Paris:** emprise au sol is not a simple percentage in `UG` — it emerges from the interaction
  of the gabarit-enveloppe formulas with lot depth, not from a stated coverage ratio.
- **Lyon:** a coefficient d'emprise au sol is carried explicitly per zone (outside Lyon/Villeurbanne)
  or per zoned block (inside Lyon/Villeurbanne). Lyon Métropole publishes this as structured data
  for most of its territory.
- **Marseille:** coverage is described but not universally tabulated per zone in the written
  règlement; the graphic-primacy rule applies here too.

---

### A.6 Context buildings, height attributes, and LOD

**National baseline — France is unambiguously ahead of where Barcelona started:**

| Layer | Source | Licence | Coverage |
|---|---|---|---|
| Building footprints + height attribute | IGN **BD TOPO®** (`HAUTEUR` field, photogrammetry/LiDAR-derived) | Open (Etalab 2.0) | National, continuously updated |
| Point cloud | **LiDAR HD** | Etalab 2.0 — free for any use including commercial deliverables, attribution only | ~80% of metropolitan France by end-2025; full national coverage targeted end-2026 |
| Classification | LiDAR HD | — | 11 classes: ground, low/medium/high vegetation, buildings, water — vegetation and building classification ship together; no separate tree dataset needed |

**No licence-click, no purchase decision, anywhere in France, for this layer.** The France
LOD200/trees blocker's purchasing half is resolved nationwide. What remains is compute
(footprint + LiDAR → LOD2 reconstruction, 3dfier/GeoFlow-style pipeline), not a business
decision, gated only by the 2026 completion date for areas not yet flown.

**§A.6.D Deviations:** Paris, Lyon, and Marseille are all near-certainly inside the covered ~80%,
given they are major metros. Confirm with a direct tile-coverage check before committing.

---

### A.7 Heritage and protective overlays

**National baseline:**
- **ABF perimeters:** a 500 m radius automatically drawn around any classified or inscribed
  historic monument, nationwide, uniform rule, requiring ABF sign-off on permits. The existence
  of the 500 m rule is national; the content of what the ABF will require is discretionary,
  case-by-case, and not data at all.
- **SUP (Servitudes d'Utilité Publique):** flood zones, aviation easements, etc. — the GPU
  explicitly serves these as their own queryable layer, returning the surface/linear/point
  footprint of each SUP act intersecting a geometry. **Unlike Ciutat Vella's heritage catalogue,
  this overlay is structurally visible in the base data path today, nationwide.**

**§A.7.D Deviations:**
- **Paris:** additional graphic layers beyond the national SUP mechanism — "fuseaux de
  protection" (protection corridors) tied to specific height articles, and secteur-specific plans
  for maisons/villas and Montmartre with particular dispositions.
- **Marseille/AMP:** Euroméditerranée (OIN — Opération d'Intérêt National) is a Marseille-specific
  state-led development zone with derogating rules inside parts of the city. The AMP analogue of
  a Barcelona-style Pla Especial carve-out — needs separate sourcing if any target parcel falls
  inside it.
- **Lyon:** no equivalent large-scale carve-out identified in this pass. Flagged as unconfirmed
  rather than absent.

---

### A.8 Massing and capacity metrics

**National baseline:** France's equivalent metric to floor area is **SDP (surface de plancher)**,
the standardized measure of enclosed floor area (since 2011–2012, replacing the older SHON/SHOB
pair). There is no national standard typical dwelling size — French dwelling-size norms vary by
housing-policy target rather than by zoning ordinance. The Barcelona card's 80 m²/dwelling module
assumption has no French legal analogue. Any capacity estimate for France must either use a
project-chosen assumption (clearly labelled as an assumption, not a legal figure) or a per-PLU
housing-mix requirement where one is stated.

---

## PART B — DEEP-DIVE PER MUNICIPALITY

### B.1 Paris (INSEE 75056 — PLU bioclimatique)

**Document:** PLU bioclimatique, single commune. Zone `UG` dominates private land; `UGSU`
(large urban services), `UV` (green urban), `N` (natural/forest) are comparatively narrow.

**What's needed:**
- Primary sourcing of UG articles UG.6 (implantation/voies), UG.7 (implantation/limites
  séparatives), UG.8 (implantation buildings to each other), UG.10.1–10.4 (hauteur plafond +
  gabarit-enveloppe formulas), verbatim from the consolidated PLU text.
- A new rule kind expressing:
  - (a) A computed reference surface (surface de nivellement de l'îlot) as the height datum — a
    geometric construction from the block, analogous to `dissolveParcelsToBlockRing` but computing
    a level, not a ring.
  - (b) The two gabarit formulas (street-facing and boundary-facing) as functions of prospect
    distance, not a lookup table.
- Overlay sourcing for Paris-specific graphic layers (fuseaux de protection, maisons/villas and
  Montmartre secteurs) — each is its own citable graphic plan.
- Live probe of whether the "plan des hauteurs" is published as a queryable GIS layer or only as
  "atlas des planches au 1/2000" PDF plates (this probe changes the estimate by 6–8 dev-days).

**Dev-day estimate:**
- 1 ADR (reference-surface + gabarit kind): ~4–5 d
- Sourcing UG.6/7/8/10 verbatim: ~4 d
- Implementation: ~10–12 d
- Graphic-plan overlay ingestion for hauteur plafond + Paris-specific corridors: ~6–8 d
  (contingent on GIS layer vs PDF plates — see above)
- **Total ~24–29 dev-days** for dominant zone (`UG`) only. `UGSU`/`UV`/`N` are each smaller,
  separately-scoped sourcing tasks.

**Tier on completion:** `constructed` (amber) — `UG` covers the large majority of Paris private
land; PSMV/heritage overlay risk remains until ABF detection is built.

---

### B.2 Lyon Métropole (SIREN 200046977 — PLU-H intercommunal, 58 communes)

**Document:** PLU-H, single intercommunal document, in force June 2019.

**What's needed:**
- **Critical unresolved probe:** confirm whether `HBCPRINC`/`HBCSEC`/`PLAFOND` and
  coefficient-d'emprise-au-sol attributes appear on the **national GPU WFS** or only on Lyon's
  own `data.grandlyon.com` open-data portal. This single probe determines the implementation path:
  - If on national GPU WFS → **config only**, existing alignment-style kind, cheap (Tier 1).
  - If only on `data.grandlyon.com` → second data source integration, more expensive.
- Sourcing `UCe1a`/`UCe1b` split as an example of per-secteur granularity.
- Carve-out for **Lyon and Villeurbanne specifically**: heights are NOT on the zone polygon but on
  separate "périmètres de hauteurs de façades" overlay zones — a structural exception inside the
  metropolitan document, needing a separate GIS layer join.

**Dev-day estimate:**
- If `HBCPRINC`/`PLAFOND` confirmed on national GPU WFS (outer 56 communes):
  ~5–7 dev-days sourcing + wiring (config only — numbers are already structured data)
- Lyon and Villeurbanne height-perimeter overlay (cannot skip — these are the city centres):
  ~8–10 dev-days for the overlay join logic alone
- **Total: ~13–17 dev-days** if national GPU WFS confirmed; higher if second data source needed.

**Tier on completion:** `constructed` (amber) for outer communes; the Lyon/Villeurbanne
height-perimeter overlay is a new data-layer integration.

---

### B.3 Marseille / Aix-Marseille-Provence (INSEE 13055 — PLUi Territoire 1 Marseille-Provence)

**Document:** PLUi AMP Marseille-Provence (Conseil de Territoire 1), approved 19/12/2019.
**This is NOT the same document as Pays d'Aix (Territoire separately approved 5/12/2024) —
a "Marseille" pack covers Territoire 1 only and does not transfer to Aix-en-Provence.**

**What's needed:**
- Sourcing the Marseille-Provence PLUi règlement specifically — obtain via GPU-returned PDF link
  for a Marseille commune, read zone articles for UA/UB/UC verbatim.
- Implementation of the **graphic-overrides-written precedence rule** as an explicit engine
  behaviour: attempt to resolve height from the graphic layer first; fall back to the zone's
  written article only where the graphic layer is silent. This precedence is stated in the
  règlement itself — getting it backwards is a legal-accuracy bug, not a style choice.
- An explicit carve-out for **Euroméditerranée (OIN)**: a state-led operation zone with derogating
  rules inside Marseille, referenced as "article 29" in local practice. The AMP analogue of
  Barcelona clau `18` (a zone that points at another instrument entirely). Decision: refuse
  initially (per `18`-precedent playbook) unless separately sourced.
- Live probe of whether the graphic layer is machine-readable as GIS data beyond zone code
  polygons. If it is PDF-only, the "graphic-first" logic cannot be implemented as an API call and
  must be a digitizing task.

**Dev-day estimate:**
- Sourcing written zones UA/UB/UC: ~6 d
- Implementing graphic-first/written-fallback resolution logic: ~10–12 d
- Euroméditerranée carve-out decision + refusal: ~4–6 d
- **Total: ~20–24 dev-days** for Marseille-Provence territoire only.

**Tier on completion:** `constructed` (amber) for zones where the written fallback is used;
graphic-layer parcels depend on whether the graphic layer is machine-readable.

---

### B.4 Cross-city comparison — the actual sequencing finding

| | Paris | Lyon Métropole | Marseille/AMP |
|---|---|---|---|
| Document scope | 1 commune, 1 PLU | 1 EPCI, 58 communes | 1 EPCI, Territoire 1 only |
| Height mechanism | Reference-surface + relative gabarit formula | Structured GIS attribute (mostly) + overlay for 2 core communes | Graphic-primacy over written text |
| Structured-data availability | Low (graphic plates, PDF-bound) | High outside Lyon/Villeurbanne | Low (graphic layer may not be machine-readable) |
| New engine kind required? | YES | Partial | YES |
| Rough dev-days (dominant zones only) | ~24–29 | ~13–17 | ~20–24 |

**The finding that should drive sequencing:** France's three largest cities are **three different
software problems**, and none generalises to the next. Picking "Paris first" buys a reference-
surface+gabarit kind that helps nobody else. Picking "Lyon first" buys the cheapest win but only
outside two specific communes. There is no dominant-city choice that reduces the cost of the other
two — the opposite of the Barcelona `13a`→`13b` relationship where the second pack was mostly free.

---

## PART C — WHAT THIS MEANS FOR SCALE

**34,900 communes is not a backlog — it is an open-ended commitment** unless CNIG's SRU standard
reaches national adoption. That adoption is outside this project's control.

**Recommended tiering:**

1. **Tier 1 — structured GIS attribute for height/coverage already published** (Lyon Métropole
   outer communes is the only confirmed example from this pass; scan other 21 métropoles' open-data
   portals for `HAUTEUR`/`hauteur`/`gabarit` fields before committing to any implementation).
2. **Tier 2 — graphic-plan-primary, PDF/plate-bound** (Paris, Marseille, and likely most historic
   city centres) — each needs new-kind engineering.
3. **Tier 3 — RNU default** (no local plan) — qualitative rules only; a citation-and-refusal
   response is the entire correct product.

**Per-EPCI (not per-commune) unit of work:** PLUi consolidation means sourcing "Lyon" covers 58
communes at once. This is a genuine efficiency France has that Spain does not — one sourcing effort
can yield many communes' coverage, IF the EPCI has completed PLUi consolidation.

**Scan-before-build task (cheapest next step before any commitment):** survey the ~22 French
métropoles' own open-data portals for structured hauteur/emprise-au-sol fields. This converts
"which city is cheapest" from a guess into a measurement.

---

**Cross-refs:** `fr/README.md` (country umbrella), `fr/NEXT.md` (blockers + resume steps),
`fr/fr-idf/75056-paris/README.md`, `fr/fr-ara/69123-lyon/README.md`,
`fr/fr-pac/13055-marseille/README.md`.
