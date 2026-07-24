# NEXT — Jeddah (`jed`, SA-02, Saudi Arabia)

> **What this file is.** Where PRYZM stopped on the Jeddah scaffold, exactly why, and precisely what to do to
> go further. Convention: `JURISDICTION-PLAYBOOK.md` §5.
> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — national footprint
> identical to Riyadh; no pack authored; exact height, parcel feed, and Al-Balad overlay geo-fenced/unheld.

## 1 — WHERE WE STOPPED (the one-paragraph truth)
Jeddah's **national footprint is byte-identical to Riyadh's** — the same 2024 MOMRAH decision, the same
`max(w/5, {3,2,2})` setback formula, the same coverage (villa 0.75 §4-1 cl. 1 / apartment 0.65 §4-2 cl. 1),
the same national vertical ceiling (villa ≤ 14 m §5-1-5 cl. 3 / apt ≤ 23 m §3-2). The city-agnostic footprint
pack (`saRiyadhDemo.ts`) would be reused with a Jeddah bbox; **no Jeddah-specific pack is authored.** We
stopped at the same wall as Riyadh — **the exact floors/height are municipal (Amanat Jeddah) + development-
authority (Jeddah Development Authority) and geo-fenced** — plus one Jeddah-specific layer: the **Al-Balad
(Historic Jeddah) UNESCO overlay**, whose JHD GIS is not confirmed open. Nothing was probed live for Jeddah
in this pass beyond confirming the Amana (Amanat Jeddah / Etmam), the development authority (approved Sept
2023), and the UNESCO inscription (2014) from secondary sources.

## 2 — THE NUMBER — THE STIPULATED NATIONAL CEILING
**Identical to the national/Riyadh number.** Denominator: the 6 governing envelope fields `{3 setbacks,
ground coverage, max height, max floors}`.
- **4 of 6 = 66.7% FULLY national** = the entire buildable footprint (setbacks §4-1/§4-2 cl. 4 + coverage
  §4-1 cl. 1 / §4-2 cl. 1). Resolves on any standard residential plot where the user supplies a street width.
- **2 of 6 nationally CEILINGED** = height/floors carry a cited national cap; the EXACT value beneath refuses
  (a bounded cited refusal, not a bare gap). Failure ≠ empty. The villa is nationally *maximised*.
- **Denominator caveat (Jeddah-specific):** exclude **Al-Balad / development-authority zones** — inside
  Al-Balad the conservation regime governs, not the national footprint.

## 3 — BLOCKERS (each: what · why it blocks · what would unblock · the EXACT resume step)

### 3.1 — 🟡 The EXACT per-zone floor/height is municipal + development-authority (geo-fenced)
- **What.** Amanat Jeddah's approved plan (المخطط المعتمد, §4 cl. 1) sets the exact floors/height per zone;
  the Jeddah Development Authority overrides on conflict (§1 cl. 3). Both are behind the Balady/authority
  geo-fence, same as Riyadh's RCRC/ADA.
- **Why it blocks (only a FULLER answer).** The bounded answer (footprint + national cap) is complete without
  it; pinning the exact height needs the per-zone number PRYZM does not hold.
- **What would unblock (ascending cost).** (a) an in-SA read of the Amanat Jeddah / Jeddah Development
  Authority per-zone height table; (b) a Balady data agreement (`NOOFFLOORS` per parcel); (c) a founder demo
  decision to render the national maximum with the over-statement caveat (C58 §1.4).
- **THE EXACT RESUME STEP.** From an in-SA egress: reach the Amanat Jeddah approved-plan viewer and the
  Jeddah Development Authority publications; assert on CONTENT (a real height table), not HTTP 200 (the WAF
  returns 200 apology pages).

### 3.2 — Live parcel data is geo-fenced (footprint uses a user-drawn plot instead)
- **What.** Balady `MapServer/28` carries setbacks + use + floors per parcel for Jeddah too, but is
  WAF/geo-fenced (NXDOMAIN on the ArcGIS host, WAF on the proxy — the enumeration is national, not
  Riyadh-specific).
- **Why it blocks.** No live classification/geometry/width from our environment.
- **What would unblock.** An in-SA egress or a MOMRAH/Balady data agreement.
- **THE EXACT RESUME STEP.** For a demo, DRAW the plot + type the width — skip this entirely.

### 3.3 — 🟠 The Al-Balad (Historic Jeddah) heritage overlay is not held as an open layer
- **What.** A parcel inside the Al-Balad UNESCO property or its buffer zone is governed by a conservation
  regime the national residential decision does not contain. The Jeddah Historic District Program GIS (651
  buildings assessed 2021–22) holds the detailed overlay but is **not confirmed as an open feed**; the UNESCO
  WHC inscription boundary (2014) is public.
- **Why it blocks.** A demo that reads the national footprint and ignores Al-Balad would state a wrong,
  over-permissive envelope on a heritage parcel — the Jeddah analogue of the R1 development-authority trap.
- **What would unblock.** An open Al-Balad property/buffer polygon (UNESCO WHC boundary as a first
  approximation), or a JHD data agreement for the building-level GIS.
- **THE EXACT RESUME STEP.** Fetch the UNESCO WHC "Historic Jeddah" property + buffer boundary (public) as a
  refuse/flag overlay; treat the JHD 651-building GIS as a `TBD` upgrade. Never derive an envelope from it —
  flag the parcel as heritage-governed and refuse the national answer there.

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)
- **4.1 — An in-region (SA) fetch path / partner** → hit Balady `MapServer/28` (setbacks + floors per parcel)
  and the Amanat Jeddah / Jeddah Development Authority per-zone tables (§3.1) — Jeddah jumps from "demo
  footprint" to "real envelope incl. height", same as Riyadh.
- **4.2 — A reusable municipal-plan floor/height extractor** (built for Barcelona's derived plans or Riyadh's
  RCRC guides) → the §3.1 blocker is the same shape; reuse it here.
- **4.3 — An open UNESCO/heritage property-boundary layer** (Al-Balad, or any city's heritage overlay) → wire
  it as the §3.3 refuse/flag overlay. A heritage-overlay reader built for Jeddah serves any city with a
  registered historic district.
- **4.4 — A GEOSA data agreement** → unlocks the national building/terrain product for Jeddah context data
  (currently global ML fallbacks — see [`../../topics/buildings-lod-height.md`](../../topics/buildings-lod-height.md)).

## 5 — WHAT IS ALREADY BUILT (do not redo)
- The city-agnostic national footprint pack `saRiyadhDemo.ts` (reused for Jeddah with a Jeddah bbox) — see
  [`../../sa-01/ruh-riyadh/findings/L-606-RIYADH-DEMO-PACK-AND-PROBES.md`](../../sa-01/ruh-riyadh/findings/L-606-RIYADH-DEMO-PACK-AND-PROBES.md).
- The national footprint clause transcription (L-606) — applies to Jeddah unchanged.
- The Jeddah local-layer identification (Amanat Jeddah / Etmam; Jeddah Development Authority Sept 2023;
  Al-Balad UNESCO 2014 + JHD GIS) — this pass, secondary sources.

## 6 — VERIFIED SOURCES (endpoint · answers · tier · exact query)
| Source | Answers | Tier | Note |
|---|---|---|---|
| 2024 MOMRAH decision (PDF) | national setbacks + coverage (identical to Riyadh) | `VERIFIED-LIVE PRIMARY` | `../../SAUDI-PRIMARY-DECISION-EXTRACT.md` |
| Balady `MapServer/28` | per-parcel setbacks/use/floors (Jeddah too) | `VERIFIED-EXISTS, geo-fenced` | `../../SAUDI-UMAPS-API-ENUMERATION.md` |
| Amanat Jeddah / Etmam | permit system (approved-plan holder) | `CONVERGENT-SECONDARY` | `etmam.momrah.gov.sa` — not probed live |
| Jeddah Development Authority | §1 cl. 3 dev-authority override (arrangements approved Sept 2023) | `CONVERGENT-SECONDARY` | secondary press; not a per-parcel feed |
| UNESCO WHC — Historic Jeddah | Al-Balad property + buffer, inscribed 2014 | `VERIFIED-PRIMARY` (inscription) | `whc.unesco.org` — boundary public |

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)
- The Riyadh geo-fence probes apply nationally: `trc.alriyadh.gov.sa` ECONNREFUSED / `rcrc.gov.sa` WAF are
  Riyadh authorities, but the Balady parcel geo-fence (NXDOMAIN + proxy WAF) is national — do not expect a
  Jeddah parcel query to succeed from outside SA either.
- `my.gov.sa/en/content/gis` — **HTTP 403** from outside SA (measured this pass) — geo-fenced, not absent.
- "Residential FAR = 3" — FALSE nationally; a commercial/hotel figure. Applies to Jeddah too.

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost
**Reuse the national footprint pack with a Jeddah bbox + add the Al-Balad refuse/flag overlay from the public
UNESCO boundary — S.** That gives Jeddah the same honest footprint demo as Riyadh, plus the one thing Riyadh
does not need: a heritage-overlay refusal so a demo never over-states inside Al-Balad. Sourcing the exact
per-zone height (§3.1) is a separate, in-SA-gated task.
