# CH-DWF corpus manifest

Fetched 2026-08-05 during `CH-DWF-VECTOR-SOURCE-INVESTIGATION-2026-08-05.md`. All files below were
downloaded live this session (`curl`, HTTP 200 each) from `gmucordoba.es`. See that findings doc for
full analysis; this file only records provenance.

## legacy_dwf_ch/ — the founder's original find (stale legacy mirror path)

Source directory (no autoindex, 403 on listing; individual files 200):
`https://www.gmucordoba.es/documentos/Gerencia_de_Urbanismo/imagenes_planos/planos/ch/dwf_ch/`

| File | URL suffix | Content |
|---|---|---|
| `G32ayuntamiento.pdf` | `dwf_ch/G32ayuntamiento.pdf` | Áreas de Reparto / Gestión overlay for the "Ayuntamiento" district tile. One text label only: `AR.CH. A1`. |
| `C32ayuntamiento.pdf` | `dwf_ch/C32ayuntamiento.pdf` (note: **no** underscore — `C32_ayuntamiento.pdf` 404s here) | Byte-identical in size to the canonical `pepch_caliyges/C32_ayuntamiento.pdf` below — this is a stale mirror of the same "Calificación y Gestión" sheet. |

## pepch_caliyges/ — canonical "Planos de Calificación y Gestión" series (15 files)

Source index page: `https://www.gmucordoba.es/pepch-planos`
Base URL: `https://www.gmucordoba.es/documentos/Gerencia_de_Urbanismo/imagenes_planos/pepch/planos/caliyges/`

Sparse point/area markers only (catalogued items `E`/`H`, delimited areas `AV`/`AU`/`AA`) — **not**
a per-parcel classification. See findings doc §3.

Files: `C12_olleria.pdf`, `C13_marrubi.pdf`, `C21_tejares.pdf`, `C22_santama.pdf`, `C23_sanlore.pdf`,
`C31_grancap.pdf`, `C32_ayuntamiento.pdf`, `C33_magdale.pdf`, `C41_trinida.pdf`,
`C42_calleferia.pdf`, `C43_santiag.pdf`, `C51_alcazar.pdf`, `C52_promano.pdf`, `C61_psrafae.pdf`,
`C62_confede.pdf`

## pepch_edificacion/ — canonical "Planos de Edificación" series (15 files) — THE FIND

Source index page: `https://www.gmucordoba.es/pepch-planos`
Base URL: `https://www.gmucordoba.es/documentos/Gerencia_de_Urbanismo/imagenes_planos/pepch/planos/edificacion/`

Dense, per-building `CODE NUMBER` labels (`MC`, `CC`, `EA`, `EV`, `MA`, `MV` + catalogue-ID number),
one per building footprint, hundreds per sheet. Cross-confirmed by the PEPCH normativa text
(Artículo 43/49) as the plan the ordinance itself designates for per-parcel protection
classification and per-parcel maximum floor count. See findings doc §4.

Files: `E12_olleria.pdf`, `E13_marrubi.pdf`, `E21_tejares.pdf`, `E22_santama.pdf`, `E23_sanlore.pdf`,
`E31_grancap.pdf`, `E32_ayuntamiento.pdf`, `E33_magdale.pdf`, `E41_trinida.pdf`,
`E42_calleferia.pdf`, `E43_santiag.pdf`, `E51_alcazar.pdf`, `E52_promano.pdf`, `E61_psrafae.pdf`,
`E62_confede.pdf`

## reference/ — supporting ordinance text (not a plan sheet)

| File | URL | Content |
|---|---|---|
| `PEPCH-NORMATIVA-coacordoba-2021.pdf` | `https://coacordoba.org/wp-content/uploads/2021/06/2021-6-PEPCH-NORMATIVA_innovaciones_aclaraciones.pdf` | Consolidated PEPCH ordinance text (Colegio Oficial de Arquitectos de Córdoba, informative purposes only, incorporates innovations to 1-2-2021). Used to independently confirm (Artículo 43, 49) that the Edificación plan is the designated carrier of per-parcel protection classification and max floor count. |

## What was NOT fetched / left for follow-up

- `Anexo II. Catálogo de Bienes Protegidos` (linked from `gmucordoba.es/anexo-ii-catalogo-de-bienes-protegidos`)
  — would let the 6-code vocabulary (`MC`/`CC`/`EA`/`EV`/`MA`/`MV`) be confirmed against a real
  legend instead of inferred from chapter structure + frequency.
- Any DWF source files themselves (`.dwf` extension) — only the PDF exports were reachable;
  no `.dwf` URL returned 200 during this session's probing.
