# Murcia corpus — retrieval log

Every route tried, with its HTTP status and the date it was tried. **A 403 anti-bot wall and a
genuine 404 are different facts** and are recorded as such (shape follows
[`../../../es-ct/08019-barcelona/corpus/RETRIEVAL-LOG.md`](../../../es-ct/08019-barcelona/corpus/RETRIEVAL-LOG.md)).

All probes below: **2026-08-01**, `curl` with a Chrome UA string.

---

## 0. ⚠ THE INHERITED CLAIM WAS WRONG, AND IT COST US A DOCUMENT

Every Murcia artefact — `sources/VERIFICATION.md` §SIG-MU1, `PRIMARY-SOURCE-VERIFICATION-2026-08-01.md`
§1, `tools/city-completion/measurements/murcia.measurements.json`, and the L-674 audit row — carried
this sentence:

> *"`urbanismo.murcia.es/infourb/documentos/` returns **HTTP 403** to automated requests (measured
> 2026-08-01 — the BCNROC pattern; a human browser reaches it)."*

**That is true of the DIRECTORY and false of the DOCUMENT.** Probed again today:

| URL | status | what came back |
|---|---|---|
| `https://urbanismo.murcia.es/infourb/documentos/` (directory) | **403** | directory listing is disabled — the wall that was measured |
| `https://urbanismo.murcia.es/…` over **TLS** | **000** | `curl` cannot verify the certificate chain on this host — use `http://` |
| **`http://urbanismo.murcia.es/infourb/documentos/Normas_Urban%C3%ADsticas_del_Plan_General_Texto_Refundido_diciembre_de_2012.pdf`** | **200** | **`application/pdf`, 2 352 553 bytes** ✅ |
| `http://urbanismo.murcia.es/infourb/documentos/MC.pdf` (the per-zone fiche the WFS `url` attribute names) | **404** | genuine 404 — that filename is not served at that path |

**A 403 on a directory index is not a block on the files inside it.** No route was ever needed: the
cited document was one correctly-formed request away for the whole time it was recorded as
unreachable. The tell was in the repo already — `esMurciaPgou2012.ts:12` records
*"(2026-08-01, HTTP 200, 2 352 553 bytes)"*, the exact byte count reproduced above. The pack header
and the measurement record contradicted each other and nobody diffed them.

**Lesson, recorded because it will recur:** probe the ARTEFACT, not its container. *"Not found"* ≠
*"does not exist"* (L-661) has a sibling — *"the directory 403s"* ≠ *"the file 403s"*.

---

## 1. `urbanismo.murcia.es` — the municipal urbanismo portal ✅ **THE CITED EDITION**

```
http://urbanismo.murcia.es/infourb/documentos/
  Normas_Urban%C3%ADsticas_del_Plan_General_Texto_Refundido_diciembre_de_2012.pdf
```

| | |
|---|---|
| **Status** | 200 · `application/pdf` · **2 352 553 bytes** |
| **Filed as** | `pdf/PGOU-MURCIA_TR-2012-12_vol11_normas-urbanisticas.pdf` |
| **SHA-256** | `ab71c65151571815ac1a1f63adb44c62969cff74a0d6448802da8098036594ab` |
| **Self-identifies as** | *PLAN GENERAL MUNICIPAL DE ORDENACIÓN DE MURCIA — Texto Refundido. diciembre 2012 · VOLUMEN 11 · NORMAS URBANÍSTICAS* |
| **Page furniture** | every page: `PLAN GENERAL MUNICIPAL DE ORDENACIÓN DE MURCIA. TR diciembre 2012  VOL 11 - NN UU - n/205` |
| **Pages** | **205**, matching the 205 pp `VERIFICATION.md` §SIG-1 records |
| **Municipality check** (the Badalona discipline) | title block reads **Murcia**, `C.I.F: P-3003000-A`, Glorieta de España 1 — ✅ the right municipality, not a neighbour |

**This is the edition `MURCIA_PGOU_SOURCE` cites and every quote in `esMurciaPgou2012.ts` came from.**
It is now in the repo and the quotes are independently re-readable, which is what `documentInRepo`
asserts.

## 2. `www.murcia.es` — the public *Normas Urbanísticas* page ✅ **THE SECOND CONSOLIDATION**

```
https://www.murcia.es/documents/2423107/2455459/
  normas_urbanisticas_adaptadas_legislacion_regional.pdf
```

| | |
|---|---|
| **Status** | 200 · `application/pdf` · **1 245 444 bytes** |
| **Filed as** | `pdf/PGOU-MURCIA_adaptado-DL-1-2005_normas-urbanisticas_murcia-es-28-02-2017.pdf` |
| **SHA-256** | `38c78780663068f564375125a5d281613e00c1139a8ee9c53a58762ae785c5bd` |
| **Self-identifies as** | *NORMAS URBANISTICAS DEL PLAN GENERAL DE MURCIA — **Documento adaptado al Decreto Legislativo 1/2005*** |
| **Municipal label** | «NORMAS URBANÍSTICAS REFUNDIDAS ADAPTADAS A LS REG. **act. 28_02_2017**» — the *file update* date on the portal, **not** an edition date |

This is the file the founder delivered in-conversation and the one the municipality links from its
public page. **It is the same document family, and §3 below establishes which way round they sit.**

## 3. `geoserver.murcia.es` — the live WFS (already wired; re-probed today)

| request | status | note |
|---|---|---|
| `GetCapabilities` (WFS 1.1.0) | **200**, 127 630 bytes | ⚠ **https only** — the http host 301-redirects |
| `DescribeFeatureType Murcia:viales` | 200 | MultiLineString street CENTRELINES; attributes `cod_padron · cod_ine · tipo_via · nombre · matricula`. **No width.** |
| `DescribeFeatureType Murcia:comunicaciones_poligonos` | 200 | MultiPolygon road SURFACES; attributes `elemento · texto · f_inicial · f_fin`. **No width.** |
| `GetFeature Murcia:comunicaciones_poligonos` bbox `-1.132,37.985,-1.128,37.989` (≈350 × 440 m of the Casco) | 200 | **4 features: 1 `Carretera Secundaria` + 3 `Carril Bicicleta`.** The historic centre's streets are ABSENT — this is the 1:5 000 topographic *carretera* network, not an urban street-surface layer. |
| `DescribeFeatureType Murcia:pgou_eje_comercial` | 200 | LineString axes of the *Ejes Comerciales* (the graphed condition Art. 5.5.3 needs). **No width** — the article's own test is *«sección mayor de 12 metros»*, still width-dependent. |
| `DescribeFeatureType Murcia:pgou_ejes` | 200 | LineString, same DXF-derived shape. **No width.** |

See `../ENVELOPE.md` §STREET-WIDTH for what this does and does not unlock.

---

*Maintainer: UNASSIGNED. Created 2026-08-01, L-676. Authority: C63 §3 Axis 2/Axis 3 · L-661 · L-674.*
