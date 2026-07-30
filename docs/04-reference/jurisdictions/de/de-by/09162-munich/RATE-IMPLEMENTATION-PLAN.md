# RATE-IMPLEMENTATION-PLAN — Munich / München (AGS 09162)

> Phased plan to raise the master RATE (`RATE.md`) toward 100 %. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

Two cheap axes are already assessed (DATA-SOURCES 20 %, CONTEXT 56 %). Munich is the highest-potential
German city: the single highest-leverage move is the DiPlanung endpoint probe.

| Phase | Axis (weight) | Action | Gate |
|---|---|---|---|
| P1 | LEGISLATION (25) | fetch `diplanung.de/schnittstellen` — check for structured XPlanGML GRZ/GFZ/Höhe; discover the Munich B-Plan WFS (`mapserver.gis.muenchen.de`, BayernAtlas) | one API probe |
| P2 | HEIGHTS/LOD (10) | read the Bavaria LoD2 (ZSHH) licence terms; if open, wire a fetcher + `munich` heightJoin, re-bake + probe | terms confirmed |
| P3 | TERRAIN (10) | wire a Bavaria DTM (Geobasis Bayern / BayernAtlas DGM) as a `terrain.mjs` source + city row, bake | `layer.json` 200 |
| P4 | DATA-SOURCES (15) | ↑ from 20 %: land P1–P3 (zone-GIS live, height + terrain wired) → cadastre remains footprint until a Bavaria ALKIS route | slot re-score |
| P5 | PARCEL (15) | resolve a Bavaria ALKIS route (or accept footprint-fallback cap); run `computeParcelConfidence` over the 09162 bbox | sample distribution |
| P6 | ENVELOPE (20) | author `de-09162-munich` rule pack once P1/P5 land (BayBO Art. 6 setback already sourced) | C58 certifiability |

DiPlanung timing is the strategic pivot (mandatory Bavaria-wide 31 Oct 2026): a probe after that date targets
the permanent platform and avoids interim-migration risk. See `NEXT.md`/`LEGISLATION-RATE.md` for the exact probes.

*Cross-refs: C63 §4, C58, `./RATE.md`, `./NEXT.md`.*
