# IDE Andalucía "urbana500/1000/2000" — WFS zoning check (Córdoba 14021)

**Date:** 2026-08-05
**Question asked:** Does IDE Andalucía's `urbana500`/`urbana1000`/`urbana2000` service already publish
live WFS zoning/calificación data for some núcleos, as a cheaper alternative to hand-tracing
scanned Córdoba PGOU-2001 sheets?

**Answer: No.** This is base topographic cartography, not zoning. It is also WMS-only — WFS is
explicitly disabled on the server. Both facts independently kill this as a shortcut.

## What `urbana500`/`urbana1000`/`urbana2000` actually are

Confirmed via IECA (Instituto de Estadística y Cartografía de Andalucía) documentation and live
GetCapabilities: these are **"Cartografía Urbana" vector base maps at publication scales
1:500 / 1:1000 / 1:2000** — large-scale topographic survey products (photogrammetric flights,
originally DGN/TIFF), analogous to a detailed municipal base map, not a planning/zoning dataset.
The name refers to map scale, not zoning tiers, as suspected.

## Endpoint & liveness

- `https://www.ideandalucia.es/wms/urbana500` — live WMS 1.3.0 (MapServer 6.2.2), Junta de
  Andalucía / IECA.
- `https://www.ideandalucia.es/wms/urbana1000` — live WMS 1.3.0, same backend.
- `https://www.ideandalucia.es/wms/urbana2000` — live WMS 1.3.0, same backend.
- **WFS is NOT enabled** on any of these endpoints. `?SERVICE=WFS&REQUEST=GetCapabilities`
  against `urbana1000` returns a MapServer exception: *"WFS server error. WFS request not
  enabled. Check wfs/ows_enable_request settings."* No DescribeFeatureType is reachable because
  there is no WFS to describe. (DescribeFeatureType step in the original task plan is therefore
  moot — confirmed via direct test, not assumed.)

## Layer/schema evidence (from live WMS GetCapabilities, urbana1000 and urbana2000)

Root layer `Urbana_1000` / `Urbana_2000`, with these layer groups — pure base-cartography
taxonomy, **no zoning/calificación layer of any kind**:

- Ámbito Cartografía (mapping extent)
- Divisiones Administrativas
- Hojas Cartográficas (sheet index)
- Relieve (terrain/relief)
- Otras Líneas
- Hidrografía
- Vegetación
- **Edificación** (building footprints — cadastral/topographic, not use classification)
- Vías de Comunicación
- Infraestructura Hidráulica / Energética / Telecomunicación
- Límite Medio Rural
- Toponimia General

No layer named or resembling `zona`, `calificacion`, `uso`, `ordenanza`, `clase_suelo`,
`planeamiento`, or `zonificacion` exists in either capabilities document. This matches the
pattern for Catastro/topographic-style base data, exactly as flagged as the likely (negative)
outcome before testing.

## Coverage (for the record, though moot given no zoning content)

- Provincial-level bounding box covers all 8 Andalucía provinces including Córdoba province
  (lon −7.59° to −1.56°, lat 35.79° to 38.82°), i.e. the *service* spans the whole region.
- However, the underlying **urbana500** product (per IECA's own documentation) was only ever
  produced for 7 specific núcleos: Alájar, Carmona, Morón de la Frontera, Guadix, Baza
  (Alcazaba), Santiponce (Parque del Alamillo), Garrucha (Parque el Palmeral) — **Córdoba city
  is not among them**. Coverage lists for urbana1000/urbana2000 were not itemized in the
  capabilities document (no per-núcleo layer breakdown), so whether Córdoba city specifically has
  1000/2000-scale base cartography here is unconfirmed — but irrelevant, since none of the three
  services carries zoning attributes regardless of coverage.

## Conclusion for the founder's question

This is a **real, tested negative** — not an assumption from the layer name. IDE Andalucía's
`urbana500/1000/2000` is live, real base cartography (buildings, roads, hydrography, relief,
toponymy) with WFS disabled entirely. It does not shortcut the Córdoba PGOU-2001 zoning
digitization work. No further time should be spent probing this specific service for zoning
data. If a live zoning/calificación WFS exists for Andalucía municipalities, it would need to
live under a differently-named IECA/Junta service (e.g. planning-specific "Ordenación
Urbanística" / PGOU digital products, DERA usos del suelo, or municipal-level open data) — none
of which were in scope of this check and would need a separate, equally quick probe before any
further manual digitization commitment.
