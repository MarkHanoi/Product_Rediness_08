# NSW — TWO NAMED BLOCKERS, PROBED. Both answers invert what was recorded.

> Lane **ENVELOPE-NSW** · probed live **2026-09-04**. Closes `PHASE0-REPORT.md` blocker **10**
> (elevation licence NOT verified) and answers build prompt **§9** (council digital DCPs).
> Transcripts: `phase0-transcripts/terrain-dcp-probe*.json`, `sydney-dcp-probe.json`.
> Scripts: `phase0-transcripts/scripts/terrain-dcp-probe.mjs`, `terrain2.mjs`, `terrain3.mjs`,
> `sydneydcp.mjs`. **Re-run them; do not re-transcribe.**
>
> ⛔ Every URL below was either published in the build prompt or discovered from a service's own
> root document. Nothing here was guessed.

---

## 1 — Elevation: ⭐ NOT GATED. The refusal was about a different product.

**First reading looked like a hard blocker:**

```
GET .../server/rest/services/NSW_Elevation_and_Depth_Theme?f=json   → {"error":"Token Required"}
```

That is the pattern that produced `identity-bootstrap-gate` for SE/DK, and it would have justified
shipping an offline stub and deferring terrain indefinitely.

**It is wrong, and the same way it was wrong before.** The *root service listing* names
`NSW_Elevation_and_Depth_Theme` as a **root-level** FeatureServer and MapServer. Probing the
service rather than the folder:

```
GET .../services/NSW_Elevation_and_Depth_Theme/MapServer?f=json      → 200, NOT gated, 3 layers
GET .../services/NSW_Elevation_and_Depth_Theme/FeatureServer?f=json  → 200, NOT gated, 3 layers
      0: SpotHeight     1: RelativeHeight     2: Contour
```

⭐ **§BULK-VS-QUERY-ENDPOINT-FALSE-REFUSALS, exactly.** *"9 of 14 blockers were refusals about the
WRONG PRODUCT."* The **folder** path is token-gated; the **service** is open. One character of path
separated "NSW terrain is access-gated, ship a stub" from "NSW terrain is open".

### ⚠ What it is, and what it is NOT — stated so nobody over-claims from a green probe

The open product is **SpotHeight / RelativeHeight / Contour — vector elevation.** It is **not** the
ELVIS / Spatial Services **LiDAR DEM** the build prompt §7 names. So:

- ✅ A **coarse ground level at a parcel** is obtainable, ungated, from contours + spot heights.
- ⛔ It is **not** a surface model, so it does **not** by itself satisfy §7's requirement to measure
  from **existing** ground level. Contours are typically derived and generalised; the Standard
  Instrument's *existing* ground level after earthworks is a survey question a contour line does
  not answer.
- ⛔ **The LICENCE IS STILL NOT VERIFIED.** `copyrightText` is **empty** on both services. Blocker
  10 is therefore **half closed**: an ungated endpoint exists, and *"we may use it"* remains
  unestablished. **Do not design around it until the licence is read.** An open port is not a
  grant.

**Recommendation:** treat vector elevation as a Tier-2 datum good enough to place an envelope
*approximately*, and keep emitting **vertically unplaced** wherever the answer is legally load
bearing — precisely as `nswHeightValue.ts` already refuses cross-datum arithmetic.

---

## 2 — Council digital DCPs: ⭐ City of Sydney serves its DCP as DATA, with clause references

Build prompt §9 A/B says the government serves *"the DCP applies here"* and never the standard
itself, and that **~128 council DCPs** hold unmapped setbacks. **For the largest council that is
substantially false**, and it is checkable in one request.

`https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services/Sydney_Development_Control_Plan_2012/FeatureServer`
— **21 layers, open, no token.**

| Layer | Name | Features | The value-bearing field |
|---:|---|---:|---|
| 3 | Building setbacks and alignment | **310** | `SetbackType` = `"4m Landscape setback"`, `"1.5m Primary setback"` |
| 5 | Building **street frontage** height in storeys | **1,214** | `Storeys` = `"2"` |
| 7 | Building height in **storeys** | **3,592** | `Storeys` = `"10"` |
| 12 | Public domain setbacks | 133 | `SetbackType` = `"10m Setback - Liveable Green Network"` |
| 16 | Specific sites | 50 | `Section` = `"6.3.1"`, `SiteName` |
| 4 | Building setbacks and alignment **clause** | 1 | `Section` = `"6.2.8"` |
| 0/1 | Active street frontages (+ clause) | 1,017 / 2 | `DCP_Name` |

Also: 6 Footpath/awnings/colonnades · 8 Land application · 11 Locality areas · 13 Proposed open
space · 14 Pedestrian priority · 15 Specific areas · 17 Streets and lanes · 20 Through-site links.

### Three findings that change NSW planning

1. ⭐ **DCP setbacks ARE mapped here — 310 + 133 features with the number in the field.** §9 A's
   *"side/rear setbacks (unmapped)"* does not hold for City of Sydney. ⚠ But the number is inside a
   **free-text label** (`"4m Landscape setback"`), not a numeric column. That is the `graphic` /
   textual failure class: recoverable, and **a regex over a free-text label is exactly the
   plausible-face shortcut this lane refuses to take casually.** It needs the same treatment as the
   NSW `LAY_NAME` vocabulary — a **closed, measured enumeration of the observed `SetbackType`
   strings**, refusing anything unlisted. That work is not done.

2. ⭐ **The DCP binds in STOREYS while the LEP binds in METRES, and both apply.** 3,592 polygons of
   `Storeys` sit under LEP HOB polygons in metres. These are **two different parameters**, `C2`
   (maximum height) and `C3` (maximum storeys) in the shared `RuleState` vocabulary — **jointly
   binding, and not inter-convertible without a floor-to-floor assumption PRYZM must not invent.**
   > This is the same structure the PT lane reports for RGEU art. 65 (minimum *pé-direito*
   > 2.40 m / 3.00 m making a metre limit and a storey count jointly binding). Two jurisdictions
   > reached it independently, which is the signal that it is a **platform** concern, not a
   > local one. ⛔ Deriving metres from storeys, or storeys from metres, is a fabrication.

3. ⭐ **`Section` carries a DCP CLAUSE REFERENCE as served data** (`"6.2.8"`, `"6.3.1"`) and every
   layer carries a per-feature **`Date`**. The build prompt's rule-lineage warning — *"effective
   dates attach per PROVISION, not per document"* — is **served, not inferred**, at least here.
   For the citation problem this is the opposite of the ePlanning overlay situation: the council
   cites its own provisions where the State does not.

### The other two named sites are NOT APIs

- `dcp.portstephens.nsw.gov.au` → **200, 64 KB of HTML**, title *"Port Stephens Council: (DCP)
  Development Control Plan"*. A web document viewer, not a service.
- `dcp.newcastle.nsw.gov.au` → **connection failure (status 0)** at the hostname as published. Not
  reachable as given; it may have moved. **Recorded as a failed probe, not as "no DCP".**

⚠ **So "find every NSW council with a GIS DCP" is NOT done** — this probe found one real API out of
three named candidates and did not sweep the remaining ~125 councils. That sweep is the §9 task and
it is **unstarted**; what is established is that the task is worth doing, because at least one
council's answer is a first-class API with values and clause references in it.

---

## 3 — What follows

1. **Read the elevation licence** before any NSW envelope is vertically placed. One document
   closes half of blocker 10. Until then: vertically unplaced, by refusal, not by omission.
2. **Enumerate `SetbackType`** across all 310 + 133 City of Sydney features into a closed
   vocabulary, the way `nswLayName.ts` handles `LAY_NAME`. Refuse unlisted strings.
3. **Add `C3` (maximum storeys) as a first-class NSW parameter** and never convert between it and
   `C2`. Coordinate with the PT lane — the joint-binding pattern is shared.
4. **Sweep the remaining councils** for `/arcgis/rest/services/*DCP*` and `*Development_Control*`.
   The City of Sydney service was found through the public AGOL search API; the same search is a
   reasonable index for the rest.
