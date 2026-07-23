# Spain — Roads & Pedestrian Infrastructure (context layer)

> Umbrella **L-511**, deep-dive **L-512**. Endpoints live-probed 2026-07-21. Both free under
> Orden FOM/2807/2015 (IGN open-data order).

Two complementary NATIONAL datasets — combine, don't pick one:
- **BTN25 "Redes de Transporte"** (IGN; part of BTN25's 88 thematic layers) — object-level transport
  network: interurban roads (with km-post reference points), urban streets, paths/tracks, rail,
  waterways, air/cable, intermodal links. Generalized at 1:25,000 — fine for site-context massing,
  coarser than NL's BGT for individual sidewalk/paving polygons. Access: WFS / ATOM / CNIG download.
- **CartoCiudad** (IGN + INE + councils) — purpose-built URBAN street network + addressing. Precise
  street centerlines and, critically, **`portales`** = building ENTRANCE POINTS at the parcel edge —
  the best source for pedestrian entry points into buildings (OSM tags entrances inconsistently).
  Live-probed: `cartociudad.es` portal **200**, geocoder API **200** (`/geocoder/api/geocoder`).

**Practical read:** BTN25 = network + classification; CartoCiudad = urban addressing + entrance points
tying pedestrian access to specific buildings. Current OSM/Overpass path stays the Tier-C fallback,
badged ESTIMATED, where these aren't wired.

## Gate
| Q | Verdict | Evidence |
|---|---|---|
| Object-level? | **YES** | BTN25 transport theme (surveyed); CartoCiudad centerlines + portales |
| CRS | ETRS89 (25830/31) / 4326 via IGN services | |
| License | Free/open, Orden FOM/2807/2015 | |
| Fallback | OSM/Overture where unwired | |

---

## 3D modeling method — ROADS (centerline -> surface -> drape) (L-512)
Spain's road layers are **centerline-based** (no per-street width polygon like NL's BGT); width is inferred:
```
1. Classify each segment by type (BTN25/CartoCiudad classification attr).
2. Assign width per class. Where unpublished, use defensible defaults by class + known urban fabric
   (Eixample grid ~20 m ROW; historic-centre streets often <8 m). STORE AS AN EXPLICIT PER-SEGMENT
   ASSUMPTION, badged like ESTIMATED — never a silent constant.
3. Buffer centerline by half-width each side -> surface polygon.
4. Junction fill: union incoming segment polygons at each node + non-convex-hull trim (architecture-
   site scale; not lane-accurate traffic geometry).
5. Drape polygon onto PNOA/ICGC DTM (2-5 m grid) -> real street grade/slope (matters on Barcelona
   hills). Accuracy bounded by DTM grid; NOT fine enough for curb reveal / camber (needs site survey).
```

## 3D modeling method — PEDESTRIAN (hardest layer; national sources fall short) (L-512)
BTN25 @1:25,000 is too coarse to separate a sidewalk from its street; Spain has no BGT/ATKIS equivalent.
Three options, by fidelity:
1. **Municipal 1:1,000-1:2,000 topo base** (councils, incl. Barcelona) — often HAS curb + paved-surface
   polygons. Highest fidelity where published as open data (check per-city, Barcelona first). 
2. **Orthophoto semantic segmentation** — PNOA 25 cm RGB+IR nationally; a DL segmentation model can
   separate sidewalk / roadway / unpaved (RGB+nDSM-as-4th-band gains, per building-footprint research).
   National coverage but a real model-training investment, not a data pull.
3. **Geometric inference (cheap fallback):** sidewalk strip = gap between road-surface polygon (above)
   and adjacent Catastro footprints, inset a small margin. Not survey-accurate, but always-available and
   a genuine step up from no pedestrian geometry.
- **Crosswalks — real Barcelona win:** Ajuntament's **"Tipologia dels passos de vianants"** (crossing
  locations + type) -> place painted-stripe texture on the road surface directly. Check other cities.
