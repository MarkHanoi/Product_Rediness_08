# Portugal — The PDM Data Model, Read In Full (the founder's brief, captured verbatim)

> **Provenance:** pasted by the founder 2026-09-02; captured same-turn per the standing rule.
> Source: Norma Técnica sobre o Modelo de Dados e Sistematização da Informação Gráfica dos PDM,
> Vol I + II, 18-02-2021, approved by Aviso n.º 9282/2021 — read directly from the DGT
> publication. Everything below is VERIFIED unless marked otherwise.
> **Execution note (orchestrator):** lane PT-ENVELOPE dispatched the same hour to execute the
> Immediate Actions (§end) — vendor the catalogue, category→developability map, object-22 gate,
> ATO_ESPECIFICO citation wiring, then the conformance measurement. Lands beside the existing
> countryAdapters/pt (CRUS zone identity, gate-shut Porto pack) — extend, never rival.

---

## Gate 1: answered. Portugal has a closed national nomenclature.

**And it is better than France's.**

The theme *Classificação e Qualificação do Solo* is a **closed list of 18 categories**, and the norm states explicitly that **new categories cannot be added** — only disaggregated into subcategories.

### Solo Urbano — 8 categories

| Code | Category | PRYZM relevance |
|---|---|---|
| 2 | Espaço Central | **Primary development target** |
| 3 | Espaço Habitacional | **Primary development target** |
| 4 | Espaço Urbano de Baixa Densidade | Development, lower intensity |
| 5 | Espaço de Atividades Económicas | Commercial / industrial |
| 151 | Espaço de uso especial – infraestrutura estruturante | Usually non-developable |
| 152 | Espaço de uso especial – equipamento | Usually non-developable |
| 6 | Espaço de uso especial – turístico | Tourism development |
| 7 | Espaço Verde | **Correct null** — no envelope |

### Solo Rústico — 10 categories

| Code | Category |
|---|---|
| 8 | Espaço Agrícola |
| 9 | Espaço Florestal |
| 10 | Espaço de Exploração de Recursos Energéticos e Geológicos |
| 11 | Espaço Natural e Paisagístico |
| 12 | Espaço de Atividades Industriais |
| 13 | Aglomerado Rural |
| 14 | Área de Edificação Dispersa |
| 15 | Espaço Cultural |
| 16 | Espaço de Ocupação Turística |
| 17 | Espaço de Equipamentos e Infraestruturas |

**Compare with France.** `TYPEZONE` has five values (U, AUc, AUs, A, N) and everything meaningful sits in the free-text `LIBELLE`. Portugal gives you **18 nationally-defined categories with semantic meaning**, and subcategories are recorded through a **typed extension mechanism** (the `ESPECIFICA` field), not invented codes.

**Practical consequence: you can answer "is this parcel developable, and for what" nationally, from the category alone, before touching any regulamento.** France cannot do that.

---

## The exact database schema

Five tables. The norm defines this as the **minimum structure required for publication in Diário da República and deposit with DGT** — a legal filing requirement, not a recommendation.

### `OBJETO_TIPO` — auxiliary lookup
| Field | Type | Notes |
|---|---|---|
| `ID` | integer | PK; FK into the graphic tables |
| `PLANTA` | text | Domain: `Ordenamento` \| `Condicionantes` |
| `TEMA` | text | Per Anexo I |
| `SUBTEMA` | text | Per Anexo I |
| `DESIGNACAO` | text | Per Anexo I |
| `CODIGO` | integer | The catalogue code (2, 3, 4… above) |

### `OBJETOS_PONTO` / `OBJETOS_LINHA` / `OBJETOS_POLIGONO` — the geometry
Seven attributes, identical across all three:

| Field | Type | Notes |
|---|---|---|
| `IDENTIFICA` | text | PK, **GUID preferred**, non-null, unique |
| `ID` | integer | FK to `OBJETO_TIPO` |
| `ESPECIFICA` | text | **The subcategory / disaggregation field.** Mandatory for UOPG, UE, programmes, plans, ARU, AUGI |
| `ETIQUETA` | text | Short label shown on the plan, e.g. `EH1` |
| `FONTE_INF` | text | Source entity of the information |
| `DATA_INF` | date | Date of the object or of its acquisition |
| `GEOM` | geometry | Point, line or polygon |
| `MEDIDA` | decimal | **Polygon area in hectares**, line length in km |

Worked example given in the norm: `DESIGNACAO = Espaço habitacional`, `ESPECIFICA = de moradias`, `ETIQUETA = EH1` → renders as *EH1 - Espaço habitacional de moradias*.

### `ATO_ESPECIFICO` — the citation table

| Field | Type | Notes |
|---|---|---|
| `IDENTIFICA` | text | FK to the graphic tables |
| `SERIE` | text | Domain: `SERIE I` \| `SERIE II` |
| `TIPO_ATO` | text | Closed domain: `Lei`, `Decreto-Lei`, `Dec-Reg`, `Decreto`, `RCM`, `Portaria`, `Aviso`, `Decisao`, `Declaracao`, `Deliberacao`, `Despacho`, `Desp-Conj`, `Regulamento` |
| `NUM_ATO` | text | Act number |
| `DATA` | date | Act date |
| `NUM_DR` | text | Diário da República issue number |
| `OBSERV` | text | Optional |

**Portugal has built legal citation into the mandatory schema.** For every servidão or restrição constituted by a specific act, the Diário da República reference is a required database record. That is the per-parameter provenance requirement satisfied by law, for the condicionantes layer, with no extraction. France has nothing equivalent.

---

## Topological guarantees

The norm requires the câmara to validate topology, and states specifically for *Classificação e Qualificação do Solo*: objects are **closed polygons covering the entire plan area**, with **no overlaps and no gaps**. Within a conformant PDM, soil qualification is wall-to-wall and unambiguous — assert it in the solver rather than defending against nulls. Also mandatory: **PT-TM06 / ETRS89** georeferencing; administrative limits from the most recent **CAOP** edition (edition date printed in the plan legend).

---

## The gap, now verified rather than assumed

**Every field in the model was checked. There is no cércea, no índice de utilização, no número de pisos, no afastamento, no emprise.** The only numeric attribute is `MEDIDA` (area/length). The norm's scope is the plantas — the maps — not the regulamento. **So: zoning identity is fully structured nationally; envelope parameters are entirely in the regulamento text.** Identical in shape to France, better at the identity layer, same-size extraction problem.

---

## Other objects worth wiring immediately (Anexo I-PO)

| Code | Object | Use |
|---|---|---|
| 18 | Estrutura Ecológica Municipal | Overlay constraint |
| 19 | Espaço Canal | Infrastructure corridor — removes land |
| 133 / 134 | Área de Risco / Área de Perigosidade | Negative overlay |
| 139 / 140 | Zona Sensível / Mista ao Ruído | Constraint on residential use |
| 20 | UOPG | Deferred-planning area — **often no direct licensing** |
| 138 | Unidade de Execução | Execution unit |
| 135 | AUGI | Illegal-origin urban area — special regime |
| 136 | ARU | Rehabilitation area — incentives, often modified parameters |
| **22 / 132** | **Área de Intervenção de Plano Municipal (PU, PP)** | **Critical: a PU or PP overrides the PDM here — wire as a DERIVABILITY GATE** |
| 149 / 150 | Geossítio / Imóvel inventariado | Heritage |

Anexo I-PC condicionantes follow the national SRUP typology in eight themes (Recursos Hídricos / Geológicos / Agrícolas e Florestais / Ecológicos, Património Cultural, Equipamentos, Infraestruturas, Atividades Perigosas) — REN (148), RAN (68), classified monuments (91–94) + protection zones (95–97) individually coded.

---

## Revised comparison

| | France | Portugal |
|---|---|---|
| Zone nomenclature | 5 coarse types + free text | **18 closed national categories** |
| Subcategory mechanism | Free text | **Typed field (`ESPECIFICA`)** |
| Schema mandated by | Standard, for GPU upload | **Legal filing requirement for DR publication** |
| Topological guarantee | Not asserted | **Wall-to-wall, no gaps, no overlaps** |
| Legal citation in schema | No | **Yes — `ATO_ESPECIFICO`** |
| Envelope parameters in schema | No | **No** |
| National bulk download | Yes, weekly | No — request by form |
| National parcel geometry | Yes | **No — still the gate** |

**Portugal's data *model* is the better one. Its data *distribution* is the worse one.**

## Still unverified

1. **How many of the 308 municipalities conform to the 2021 norm** (plans approved before Feb 2021 predate it; older = Norma 01/2011 or nothing). **The single most important Portuguese unknown.**
2. **Whether DGT publishes the five tables as WFS** or only renders them (SNIT claims per-instrument WMS/WFS + documents + metadata + plan history — measure).
3. Whether `MEDIDA`/`ESPECIFICA`/`ETIQUETA` are populated in practice.
4. Anexo I-PO codes 41–52+ truncated in the read; Sistemas Estruturantes continues past 50.

## Immediate actions

1. **Vendor the catalogue** — 18 soil categories + condicionantes codes + the five-table schema. Stable, national, legally mandated — encode once.
2. **Category → developability map** — 2/3/4/5/6 development targets; 7/151/152 correct nulls; rústico 13/14/16 limited; the rest refusals. **Shippable nationally with no regulamento parsing.**
3. **Wire object 22 as a derivability gate** (PU/PP override).
4. **Wire `ATO_ESPECIFICO` into the citation layer** — free provenance for every condicionante.
5. **Then measure conformance** — everything above applies only to conformant PDMs.
