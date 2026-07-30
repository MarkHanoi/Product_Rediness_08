# Berlin — Land technical profile

**ISO 3166-2:** `de-be` · **Type:** city-state (Land == municipality) · **CRS:** ETRS89 / UTM 33N
(EPSG:25833) · **Last updated:** 2026-07-30 · **Status:** open (convergent) — unprobed

> **Confidence: CONVERGENT-SECONDARY throughout.** Berlin LoD2 is research-confirmed open via
> FIS-Broker but NOT live-probed (a 2026-07-24 probe of `gdi.berlin.de/services/wfs/lod2_gebaeude`
> returned HTTP 404 — endpoint moved, openness confirmed by topic doc, not by that URL). Probe
> before any RATE cell moves. Empty and failed are the same value.

Berlin is a city-state: the Land technical layer and the municipal envelope layer coincide. The
legal/envelope side (4 regimes, 1958/60 Baunutzungsplan) lives in the RATE dossier — see
`../CITIES/Berlin.md` and `../de-be/11000-berlin/`.

---

1. **Exec summary (readiness /10)** — 9.4 (reviewer est.). GDI-BE open geodata; FIS-Broker LoD2;
   the drag is the 4-regime envelope classifier, not the technical data.
2. **Responsible authorities** — GDI-BE (Geodateninfrastruktur Berlin) + FIS-Broker
   (`fbinter.stadt-berlin.de`); shared platform with Brandenburg.
3. **CRS** — native **EPSG:25833** (UTM33N, east zone). DHHN2016 height datum.
4. **Cadastre (ALKIS)** — `Flurstück` via GDI-BE WFS; licence DL-DE BY 2.0 (reported open). Reverse
   lookup / endpoint TBD — probe `gdi.berlin.de`. CONVERGENT-SECONDARY.
5. **Buildings** — LoD1 / LoD2 CityGML via FIS-Broker; ALKIS `Gebäude` footprints.
6. **Building heights** — LoD2 measuredHeight + traufhoehe/firsthoehe + roof planes (convergent).
7. **Terrain** — DGM1 LiDAR via GDI-BE (convergent).
8. **DSM** — not needed (LoD2 true height).
9. **Orthophotos** — DOP20 via GDI-BE WMTS/WMS (convergent).
10. **Administrative** — AGS `11000000`; VG250 routing; 12 Bezirke.
11. **Addresses** — GDI-BE address WFS (convergent).
12. **Roads** — ATKIS Basis-DLM / OSM.
13. **Hydrography** — Spree/Havel via ATKIS / EU Flood Directive.
14. **Protected areas** — BfN Natura2000 + Berlin landscape/Erhaltungsverordnung (district-level).
15. **Geology** — BGR + Berlin state geology.
16. **Planning** — 4 regimes: §30 B-Plan / §173(3) Baunutzungsplan 1958-60 / §34 / §35. XPlanung via
    FIS-Broker; DiPlanung operational (as of 2026-07-23). See RATE dossier.
17. **Envelope feasibility** — VERY HIGH complexity (regime classifier + Baunutzungsplan voidance
    risk). Legal, not technical. See `../de-be/11000-berlin/`.
18. **Performance** — FIS-Broker WFS; suited to a bake.
19. **PRYZM impl** — `LandResolver → BerlinProvider`; CRS 25833. Second onboarding Land after NRW.
20. **Outstanding unknowns** — current LoD2 WFS URL (old 404); ALKIS endpoint/auth; XPlanGML
    GRZ/GFZ/Höhe null-rate; Baustufen → GRZ/GFZ table. All probe items.

---

**Probe evidence:**

| Endpoint | Probed | Result | Verdict |
|---|---|---|---|
| `https://gdi.berlin.de/services/wfs/lod2_gebaeude` | 2026-07-24 | HTTP 404 (endpoint moved) | not confirmed this pass — LoD2 openness per topic doc only |

**Related:** `../LAND-REGISTRY.md` (row 3) · `../CITIES/Berlin.md` · `../de-be/11000-berlin/README.md`
(4-regime legal analysis) · `../GERMANY.md`.
