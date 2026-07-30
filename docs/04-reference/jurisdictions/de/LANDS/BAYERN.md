# Bayern (Bavaria) — Land technical profile

**ISO 3166-2:** `de-by` · **Land seat:** München · **CRS:** ETRS89 / UTM 32N (EPSG:25832) ·
**Last updated:** 2026-07-30 · **Status:** **TBD — probe licence**

> **Confidence: CONVERGENT-SECONDARY throughout; LoD2/ALKIS openness is TBD.** Bavaria hosts the
> ZSHH national LoD2 gateway, but **hosting ≠ confirmed open terms** for Bavaria-local access.
> Read the Bayerische Vermessungsverwaltung licence at `geodaten.bayern.de` before assuming open.
> Probe before any RATE cell moves. Empty and failed are the same value.

Bavaria's municipal envelope work (München) lives in the RATE dossier — see `../CITIES/Munich.md`
and `../de-by/09162-munich/`.

---

1. **Exec summary (readiness /10)** — 9.2 (reviewer est.). Rich data; the open question is licence,
   not existence. LoD2 available (ZSHH host), openness TBD; DiPlanung mandatory statewide 31 Oct 2026.
2. **Responsible authorities** — Bayerische Vermessungsverwaltung / Landesamt für Digitalisierung,
   Breitband und Vermessung (LDBV); portal `geodaten.bayern.de`.
3. **CRS** — native **EPSG:25832** (UTM32N, west zone). DHHN2016 height datum.
4. **Cadastre (ALKIS)** — `Flurstück`; licence TBD (possible fee/registration). Probe
   `geodaten.bayern.de` parcel WFS. CONVERGENT-SECONDARY.
5. **Buildings** — LoD1 / LoD2 CityGML; national LoD2-DE download reported via HVD/ATOM. Openness TBD.
6. **Building heights** — LoD2 measuredHeight + traufhoehe/firsthoehe + roof planes (if open).
7. **Terrain** — DGM1 LiDAR via WCS/GeoTIFF (convergent).
8. **DSM** — not needed (LoD2 true height).
9. **Orthophotos** — DOP20/40 via WMTS/WMS (convergent).
10. **Administrative** — AGS (München `09162000`); VG250 routing; Land code `09`.
11. **Addresses** — Hauskoordinaten (ZSHH hosted in Bavaria); per-Land terms.
12. **Roads** — ATKIS Basis-DLM / OSM.
13. **Hydrography** — ATKIS / EU Flood Directive.
14. **Protected areas** — BfN Natura2000 + Bavarian landscape.
15. **Geology** — BGR + Bayerisches Landesamt für Umwelt (LfU).
16. **Planning** — BauGB → BauNVO → municipal B-Plan; **DiPlanung mandatory from 31 Oct 2026**
    (interim services until then; already operationally live 2026-07-23). See RATE dossier.
17. **Envelope feasibility** — municipal; §34 fraction for München unmeasured. Legal, not data.
18. **Performance** — HVD/ATOM bulk + WMS; suited to a bake once licence confirmed.
19. **PRYZM impl** — `LandResolver → BayernProvider`; CRS 25832. Fourth onboarding Land (after
    NRW → Berlin → BW), gated on licence.
20. **Outstanding unknowns** — **LoD2 licence (open vs restricted)**; ALKIS WFS access terms; DOP
    endpoints; XPlanGML null-rate. Licence resolution is the primary blocker.

---

**Related:** `../LAND-REGISTRY.md` (row 2) · `../CITIES/Munich.md` · `../de-by/09162-munich/README.md`
· `../GERMANY.md`. Open licence question is also tracked in `../README.md §7` and `../sources/SOURCES.md §B`.
