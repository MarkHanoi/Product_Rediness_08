# France — regions

France is a **single national product** for all core data layers (IGN PCI Express parcels, GPU
zoning, BD TOPO buildings, LiDAR HD point cloud). Unlike Germany (16 Bundesländer with separate
WMS servers per state) or Spain (CCAA with País Vasco / Navarra maintaining separate cadastres),
**no per-region endpoint routing is needed for the national pipeline.**

## Routing rule

All French parcels route through the identical national endpoints:
- Parcels: `data.geopf.fr/wfs` or `apicarto.ign.fr/api/cadastre`
- Zoning: `apicarto.ign.fr/api/gpu` or `data.geopf.fr/annexes/ressources/wfs/gpu.xml`
- Context buildings: `data.geopf.fr/wfs` (`BDTOPO_V3:batiment`)

**No region polygon is needed to select an endpoint.** A bbox anywhere in metropolitan France
routes to the same URLs.

## Per-region notes (only where there is a material difference)

| Region | Note | Status |
|---|---|---|
| Île-de-France (IDF) | Paris (75056) — PLU bioclimatique; height mechanism is reference-surface + gabarit formula. No different endpoint but a different rule-pack architecture. See `../fr-idf/75056-paris/`. | Scoped |
| Auvergne-Rhône-Alpes (ARA) | Lyon Métropole (69123 + 57 communes) — PLU-H intercommunal; may require `data.grandlyon.com` as a second data source for `HBCPRINC`/`PLAFOND` if not on national GPU WFS. See `../fr-ara/69123-lyon/`. | Probe required |
| Provence-Alpes-Côte d'Azur (PAC) | Marseille / AMP — PLUi Territoire 1 Marseille-Provence; graphic-plan-primacy rule. See `../fr-pac/13055-marseille/`. | Scoped |
| Overseas territories (DOM-TOM) | Out of scope — planning law has local variants; separate study required before any DOM-TOM city can be added. |  Out of scope |
| Alsace-Moselle | Historically follows a local civil law regime; planning law was unified but some property-law carve-outs exist. Monitor — not material for the three initial cities. | Monitor |
