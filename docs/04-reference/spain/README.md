# Spain — priority tier + live-verified region status

**Built 2026-07-20 from primary sources. Supersedes the SEED/§3 tables in the
"Spain — Full Municipality Register" doc, which described 318 SEED municipalities but
contained exactly ONE tagged row (`30003 Águilas`) — the tagging pass was never run.**

## Files
| File | Contents |
|---|---|
| `priority_318.csv` | Top 318 by population — the SEED tier |
| `priority_407.csv` | Top 407 (5% of 8,132) — SEED + PRIORITY_407 |
| `seed_counts_by_ccaa.csv` | Per-CCAA counts + live-verified region tier (drives sequencing) |

Schema: `ine_code,municipio,provincia,ccaa,population,rank,tier,region_tier`

## Provenance
- **Population:** INE *Cifras oficiales de población · Revisión del Padrón a 1 de enero de 2025*
  (`ine.es/pob_xls/pobmun.zip` → `pobmun25.xlsx`, published 2025-11-18). This is the exact
  source the register doc's §1.2 specifies.
- **CCAA mapping:** standard INE province→CCAA table, **validated** by reproducing the official
  per-CCAA municipality totals exactly (Andalucía 785, Castilla y León 2,248, 8,132 total,
  0 unmapped). A wrong mapping could not produce those counts.
- **`region_tier`:** live `DescribeFeatureType` / ArcGIS REST metadata pulled 2026-07-20 —
  NOT copied from either research document.

## Cut-offs
`rank 318 = 26,273` inhabitants · `rank 407 = 20,965`. This confirms the register doc's
estimate that the boundary zone sits at roughly 20k–35k.

## Two joining traps (both cost real time if hit)
1. **`ine_code` is a zero-padded 5-char STRING** (`04013`). Spreadsheets silently strip the
   leading zero and the Catastro/regional joins then fail.
2. **INE uses bilingual, Valencian/Catalan-first names in a specific order** —
   `València`, `Alacant/Alicante`, `Castelló de la Plana/Castellón de la Plana`,
   `Coruña, A`, `Ejido, El`. A naive name join drops them. **Join on `ine_code` only.**
   (A capital-coverage check "failed" on exactly these three before being traced to naming —
   all 52 provincial capitals ARE in the SEED 318.)

## What the counts change about sequencing
- **Andalucía is #1 by SEED (57)** and has the weakest confirmed data situation
  (document registry; no planning-geometry WFS confirmed). Highest value, highest risk.
- **Four regions hold 60% of the SEED tier**: Andalucía 57, Cataluña 52, Valencia 50,
  Madrid 31 = 190/318.
- **Castilla y León is 2,248 municipalities (28% of Spain) but only 13 SEED.** The register
  doc's §5.4 advises prioritising curation by "Andalucía and Castilla y León — the biggest
  counts". That is true by RAW municipality count and **false by SEED count** (CyL ranks 10th).
  Sequencing should follow SEED count, not municipality count.
- **16 SEED municipalities sit behind the foral-cadastre blocker** (País Vasco 14 + Navarra 2):
  parcel-select does not work there at all until a non-Catastro adapter exists.

## The finding that reframes Phase 1
All three "Tier-1" regions were verified live and **none publishes numeric envelope fields**:
- Cataluña `MUC_QUALIFICACIONS` → `CODI_INE, CODI_QUAL_AJUNT, CODI_QUAL_MUC, DESC_QUAL_*` only.
- Madrid `PG_CONDICIONES_EDIFICACION` → `CODMANZANA, NUMORD, COND_EDIF`(code), `COEF_Z`(string),
  `FESPECIFICA`(ficha ref). Numbers live behind the ficha, not in the service.
  (`PG_ORDENACION`, cited by the companion doc as carrying edificabilidad/VEDA, returns **no
  fields at all** on its ordenación layers — that claim is incorrect.)
- Valencia `Planeamiento.Zonificacion` → zone code + description, **plus `url_abs`**, a direct
  link to the governing document ON the polygon (this solves PDF enumeration for Valencia).

**Only numeric source found in Spain:** Valencia `ms:InventarioSuSuz` — `sup_m2` + `edif_m2`,
so FAR = `edif_m2 / sup_m2` is computable. Caveat: it is the *suelo urbanizable* sector
inventory — **sector-level, not parcel-level**, and only for developable land.

**Consequence:** ~42% of the SEED tier (the three Tier-1 regions, 133 municipalities) still
requires 100% PDF curation for every number surfaced. Phase 1's "structured or near-structured"
framing does not survive contact with the endpoints.

## Direct evidence for the C58 model-fit question
Madrid publishes **`Fondo de la Edificación` as a POLYLINE with no attributes** — buildable
depth expressed as *a line you build up to*, not a setback number. The C58 envelope
(setbacks + height + FAR) cannot represent that shape. This is no longer a hypothesis about
Spanish planning; it is the published data model of Spain's second city.
