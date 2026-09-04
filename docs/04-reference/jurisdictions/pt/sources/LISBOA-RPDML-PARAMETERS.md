# Lisboa (DICOFRE 1106) — RPDML numeric parameters, EXTRACTED 2026-09-04

<!-- Lane ENVELOPE-IBERIA. Closes `pt/NEXT.md` §0.1 step 3 ("Retrieve the Lisboa RPDML regulamento
     and extract it — Lisboa's numeric tables are entirely UNKNOWN") and the `SOURCES.md` §D row
     "Lisbon PDM categorias de espaço full list + numeric values … index/cércea not sourced".
     Every value below is VERBATIM from a document retrieved in this pass, with its artigo, its
     Portuguese sentence and its PDF page. Nothing is recalled, inferred or rounded. -->

> **Status:** `VERIFIED-PRIMARY` for every row that carries an artigo + quote + page.
> **`NOT FOUND (absent by design)`** is used where the governing article is a CLOSED LIST of
> alíneas that simply contains no such parameter — that is a MEASURED ABSENCE, not a failed search,
> and the distinction is load-bearing (§CONTEXT-DATA-HONESTY: failure ≠ empty).
>
> ⛔ **This document sources NOTHING for the engine yet.** No Lisboa rule pack exists, no gate is
> open, and the §PT-NATIONAL-REGISTRATION refusal is what a Lisboa parcel receives today. This is
> the transcription a signature would be given to review.

---

## §1 — Documents obtained

⚠ **`WebFetch` returns 403 on both `lisboa.pt` and `dre.pt`; `curl` with a browser UA returns 200.**
That is a user-agent filter, **not an auth wall** — earlier passes that recorded these sources as
unreachable were reading a UA block. Record it here so nobody re-refuses them.

| # | Document | URL | HTTP | Bytes | sha256 (head) | Why it is the in-force text |
|---|---|---|---:|---:|---|---|
| **D1** | **RPDML — republicação integral**, Declaração de Retificação n.º **703/2020**, DR 2.ª série n.º 202, **16 Out 2020** (republishing Declaração n.º 70/2020) | `lisboa.pt/fileadmin/portal/temas/urbanismo/planeamento_urbano/PDM/1_alteracao/Regulamento_PDM.pdf` | 200 | 2 984 380 | `c6188cba…836687` | It is the file **CML's own "PDM em vigor" page serves as *Regulamento do PDM***; that link targets DRE record 145585233 = Decl. Retif. 703/2020. 82 pp, 261 072 chars, text layer. p. 1: «*procede-se à sua republicação integral*». |
| D2 | Aviso n.º 11622/2012 (original 2012 publication) | `…/PDM/PDM_DR_2s_n168_Aviso_n11622_2012.pdf` | 200 | 944 143 | `7cb6e62d…f31e94` | Original. **Downloaded but NOT quoted below** — superseded by D1. |
| D3 | **Despacho n.º 5/DMU/CML/2025 — Orientações Técnicas RPDML**, Boletim Municipal 1651, 3.º supl., 9 Out 2025 | `lisboa.pt/fileadmin/info_administrativa/normativas/despachos_deliberacoes/Despacho_5_DMU_CML_2025.pdf` | 200 | 245 874 | `7a15ed7a…877f18` | Newest CML interpretive guidance; revokes Despachos 6/DMU/CML/2021 and 7/DMU/2017. **Alters no parameter.** |
| D4 | *PDM em vigor — Planta de Ordenamento, Qualificação do espaço urbano* (official legend) | `websig.cm-lisboa.pt/MuniSIG/Anexos/anexolegPDM_vigor.pdf` | 200 | 2 125 346 | `d8d504e7…11089c` | The legend CML attaches to every LxPlantas certificate. |
| D5 | Planta de Ordenamento vector package (Qualificação) | `…/PDM/1106_PO_01.zip` | 200 | 8 992 640 | `2ac14420…5243b4` | Token-free. Contains `QUALIFICACAO.mpk` — **a 7z archive**, not a zip (magic `377abcaf271c`). Not unpacked in this pass. |

**Latest-in-force determination.** D1 (Oct 2020) is the last *republicação integral*. The only later
change identified is a **2023 alteração simplificada** reclassifying **one site** (part of Bairro São
João de Brito, Alvalade) — a **Planta** change, not an article change. ⚠ **An exhaustive DRE
enumeration of alterações 2020 → 2026 was NOT done** (DRE detail pages return a JS-only SPA shell to
`curl`); the resume step is `files.dre.pt/gratuitos/2s/{YYYY}/{MM}/…` by index, or the `IDDEPOSITO`
history for DICOFRE 1106 from `snit.web@dgterritorio.pt` — the email already queued as `NEXT.md`
§0.1 step 1.

---

## §2 — ⭐ THE HEADLINE: Lisboa is NOT representable as scalars for its three highest-volume zones

| Zone | Shape of the rule | Scalar envelope from the RPDML alone? |
|---|---|---|
| **Traçado Urbano A** | **fabric-derived (formula) + geometric** | ❌ **No.** Height = mean of NEIGHBOURS' façade heights. **No índice exists at all.** |
| **Traçado Urbano B** | fabric-derived + geometric + **4 conditionals** | ❌ **No.** Same mean-height formula, + 3,5 m recuado/sótão increments. **No índice.** |
| **Traçado Urbano C** | ⚠ **SPLIT by typology** | **Partly.** *banda* → fabric-derived. **isolated → 25 m SCALAR**, and no empena-depth limit. **No índice** either way. |
| **Traçado Urbano D** | ✅ **mostly scalar** | **Yes** — the only traçado with a real índice: **Ie 1,0 / 0,7**, permeability 0,3, both gated on parcel depth/area. |
| **Espaço Central e Habitacional a Consolidar** | referential + scalar Ie, **gated** | **Partly.** **Ie 1,2 / 1,7 POLU** (maj. 1,5 / 2,0) is scalar; **height has no scalar at all** — Art. 60.º n.º 2 sends you to *"as regras referentes ao espaço consolidado contíguo de maior dimensão"*, a SPATIAL LOOKUP INTO A NEIGHBOURING POLYGON that lands back in the fabric-derived A/B/C rules. |
| **Espaço de Actividades Económicas Consolidado** | ✅ scalar Ie only | **Ie only.** **1,2** (maj. 1,5) + a **+10 %** rule for sites already at Ie ≥ 1,5. **No height, no storeys, no depth, no setbacks exist.** |

**Three structural consequences.**

1. ⭐ **Lisboa's dominant height parameter is not a number — it is a NEIGHBOUR QUERY, and it is
   fully specified.** *Média da altura das fachadas* (Art. 4.º d) is a **TRIMMED MEAN**: take the
   *frente edificada* between two cross-streets, **on the same side of the street**, measure each
   façade at its MIDPOINT, **discard the tallest and the shortest**, average the rest. This is the
   same FAMILY as Porto's *moda da cércea* — for which ADR-0379 already minted the C58
   `context-aggregate` GeometricRule kind — but it is a **different aggregate** (trimmed mean, not
   extent-weighted mode) and a **different member-set scope** (street-segment + same side, not the
   block frontage). ⇒ **`ContextAggregateRule.aggregate` needs a `trimmed-mean` member and the
   contextSet needs a same-side street-segment scope. REPORTED, not built by this lane.**
2. **The absences are MEASURED, not gaps in the search.** Arts. 42.º n.º 3 / n.º 4 / n.º 6 and
   Art. 48.º are closed lists of alíneas that contain no índice and (for 48.º) no height at all.
   Per L-616 the honest render is **UNKNOWN-pending-fabric** — drawing them as zero *or* unbounded
   is an overstatement on real land.
3. **`Créditos de construção` (Art. 84.º) can lift the cap on almost every rule below.** It appears
   as an exception in Arts. 42.º, 46.º, 48.º, 60.º and 62.º (Art. 84.º n.º 6 names exactly those
   five), is denominated in **m² of superfície de pavimento** (n.º 5) and is operationalised by a
   separate *regulamento municipal* (n.º 4). ⇒ the `transferableRights` C58 amendment named in
   `NEXT.md` §0.1 step 5 is **real and correctly scoped**.

---

## §3 — Cross-cutting definitions (bind every row in §4)

| Parameter | Value / formula VERBATIM | Artigo | Verbatim Portuguese | PDF p. / DR Pág. |
|---|---|---|---|---|
| **`Ie` definition** | `Ie = ∑ Sp / As` | **Art. 38.º n.º 3** | «O Índice de edificabilidade (Ie) é o quociente máximo admitido entre a superfície de pavimento (Sp) duma operação urbanística e a área de solo (As) a que o índice diz respeito de acordo com cada categoria de espaço: Ie =∑ Sp/As.» | 40 / 334 |
| `Ie` bonus | «bonificado até um máximo de **4 %**» (salas de condomínio + átrios) | **Art. 38.º n.º 4** | «O Índice de edificabilidade (Ie) e a sua eventual majoração é bonificado até um máximo de 4 % para a construção de salas de condomínio de edifícios em propriedade horizontal e átrios dos edifícios…» | 40 / 334 |
| ⭐ **`Média da altura das fachadas`** | mean of surrounding façade heights, measured **at the façade midpoint**, over the *frente edificada* **between two transversais**, **same side** of the street, **excluding the tallest and the shortest** | **Art. 4.º d)** | «corresponde à média das alturas das fachadas envolventes, medida do ponto médio da fachada e expressa em metros, relativa a uma frente edificada, situada entre duas transversais, do lado do arruamento onde se integra a parcela ou o lote a intervencionar, **não se contabilizando para o efeito o edifício mais alto e o mais baixo dessa frente**. Nos conjuntos arquitetónicos homogéneos … é imposto o nivelamento pela altura das fachadas características daquele conjunto. Nas situações em que não seja possível recorrer à frente edificada entre duas transversais onde se localiza a operação, deve recorrer-se à frente edificada entre duas transversais mais próxima» | 21 / 315 |
| **`Superfície de pavimento`** | measured by the EXTERNAL wall perimeter, **excluding** varandas, áreas em sótão, cave without regulation pé-direito, and covered collective exterior spaces | **Art. 4.º d)** | «corresponde à área, abaixo ou acima da cota de soleira, medida em m2, pelo perímetro exterior das paredes exteriores … excluindo varandas, áreas em sótão e em cave sem pé direito regulamentar e espaços exteriores cobertos de utilização coletiva (alpendres, telheiros e terraços cobertos)» | 21 / 315 |

⛔ **`Sp` IS NOT THE NATIONAL `Ac`.** DR 5/2019's *área de construção* **INCLUDES** covered exterior
spaces (alpendres, telheiros, varandas, terraços cobertos); Lisboa's `Sp` **EXCLUDES** them. **A
yield computed with one and compared against the other is wrong.** This trap is encoded in
`packages/site-parcel-data/src/countryAdapters/pt/ptConceptLexicon.ts`
(`superficie de pavimento` alias) so a transcriber meets it at transcription time.

---

## §4 — The parameter table

### §4.1 — Traçados Urbanos A / B / C / D Consolidado

All four share ONE article set (37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 88, 89 — confirmed
independently by CML's own `ART_RPDM` attribute, §5). ⭐ **The traçado distinction lives entirely
inside the NUMBERED PARAGRAPHS of Artigo 42.º**, so a rule pack must key on the traçado LETTER to
select `n.º 3 / 4 / 6 / 7` — never on an article.

| Zone | Parameter | Value or formula VERBATIM | Artigo + alínea | PDF p. / DR Pág. | Confidence |
|---|---|---|---|---|---|
| **A** | altura máx. da **edificação** | **FORMULA** — «a média das alturas dos edifícios da frente edificada do arruamento, entre duas transversais» | **42.º n.º 3 a)** | 43 / 337 | `VERIFIED-PRIMARY` |
| **A** | altura máx. da **fachada** | **FORMULA + CONDITIONAL** — média das alturas das fachadas; between two taller abutting buildings may adopt the taller neighbour's height **iff** the added Sp is exclusively housing **and 50 % is rent/price-capped** | **42.º n.º 3 b)** | 43 / 337 | `VERIFIED-PRIMARY` |
| **A** | roof / sótão | **GEOMETRIC** — contained within **45° planes** through the top lines of ALL façades; must not exceed the altura máxima da edificação | **42.º n.º 3 d)** | 43 / 337 | `VERIFIED-PRIMARY` |
| **A** | índice de edificabilidade | **NONE.** n.º 3 is alíneas a)–h) and assigns no índice. Ie attaches to Traçado A only in *loteamentos* (Art. 46.º) | 42.º n.º 3 (absence) | 43 / 337 | **NOT FOUND (absent by design)** |
| **B** | altura máx. da fachada | **FORMULA + 4 CONDITIONALS** — média das alturas das fachadas, save b) i–iv: i) rent-capped housing infill; ii) *remate de quarteirão* where Sp does not exceed the mean-height result **and public space increases**; iii) *remate* using **créditos de construção** (Art. 84.º) subject to public debate; iv) pre-existing municipal commitments | **42.º n.º 4 a)–b)** | 43 / 337 | `VERIFIED-PRIMARY` |
| **B** | piso recuado | **SCALAR INCREMENT — ≤ 3,5 m** above the max façade height, within 45° planes, only where dominant on that frente urbana or closing an existing empena | **42.º n.º 4 d)** | 44 / 338 | `VERIFIED-PRIMARY` |
| **B** | sótão / cobertura | **SCALAR INCREMENT — ≤ 3,5 m** above the max façade height, within 45° planes | **42.º n.º 4 e)** | 44 / 338 | `VERIFIED-PRIMARY` |
| **B** | índice de edificabilidade | **NONE** in n.º 4 (alíneas a–h) | 42.º n.º 4 (absence) | 43–44 | **NOT FOUND (absent by design)** |
| **C** | altura máx. fachada — **banda** | **FORMULA** — «obedece ao nivelamento das alturas das fachadas existentes na envolvente» | **42.º n.º 6 a)** | 44 / 338 | `VERIFIED-PRIMARY` |
| **C** | altura máx. fachada — **isolated** | ⭐ **SCALAR — 25 metros**, except: i) inside a plano de pormenor / unidade de execução; ii) pre-PDML municipal commitments; iii) operations incorporating **créditos de construção** (Art. 84.º) subject to public debate | **42.º n.º 6 b)** | 44 / 338 | **`VERIFIED-PRIMARY`** |
| **C** | índice de edificabilidade | **NONE** in n.º 6 (alíneas a–f) | 42.º n.º 6 (absence) | 44 / 338 | **NOT FOUND (absent by design)** |
| **C** | volumetria review | **DRAWING-DERIVED** — assessed against the viewpoints on the *Planta do sistema de vistas* | **Art. 60.º n.º 4** | 57 / 351 | `VERIFIED-PRIMARY` |
| **D** | n.º de pisos | ⭐ **SCALAR / CONDITIONAL** — keep the dominant façade height; **one-storey moradias may go to two storeys**, counted from the cota de soleira | **42.º n.º 7 a)** | 44 / 338 | **`VERIFIED-PRIMARY`** |
| **D** | basement | **SCALAR** — one buried or semi-buried floor in addition | **42.º n.º 7 b)** | 44 / 338 | `VERIFIED-PRIMARY` |
| **D** | sótão | **SCALAR INCREMENT — ≤ 3,5 m** above the max façade height, within 45° planes | **42.º n.º 7 c)** | 44 / 338 | `VERIFIED-PRIMARY` |
| **D** | **índice de permeabilidade** | ⭐ **SCALAR — 0,3**, gated on parcel **depth > 14 m and/or area > 130 m²** | **42.º n.º 7 d)** | 45 / 339 | **`VERIFIED-PRIMARY`** |
| **D** | **índice de edificabilidade** | ⭐ **SCALAR, AREA-STEPPED — `1,0` if lot < 150 m²; `0,7` if ≥ 150 m²; ALWAYS at least 150 m² of Sp permitted.** Same > 14 m / > 130 m² gate | **42.º n.º 7 e) i)–ii)** | 45 / 339 | **`VERIFIED-PRIMARY`** |
| **A, B, C** | **profundidade máxima da empena** | ⭐ **SCALAR — 15 m**; **18 m** for hotels and equipamentos de utilização coletiva; **excludes varandas and corpos balançados** | **Art. 43.º n.º 1** | 45 / 339 | **`VERIFIED-PRIMARY`** |
| **A, B, C** | profundidade — neighbour override | **GEOMETRIC** — aligns to retained abutting façades | **43.º n.º 2** | 45 / 339 | `VERIFIED-PRIMARY` |
| **A, B, C** | profundidade — virtual empena | **GEOMETRIC** — concordance with a **virtual 15 m** empena | **43.º n.º 3** | 45 / 339 | `VERIFIED-PRIMARY` |
| **A, B, C** | profundidade — transition | **GEOMETRIC** — a **45° dihedral** between empenas of differing depth | **43.º n.º 4–5** | 45 / 339 | `VERIFIED-PRIMARY` |
| **C** (isolated) | profundidade | ⭐ **NO LIMIT** — «Os edifícios isolados não estão sujeitos a uma profundidade máxima de empena.» | **43.º n.º 6** | 45 / 339 | `VERIFIED-PRIMARY` |
| **D** | profundidade da empena | **NONE** — n.º 7 a)–e) carries **no cross-reference to Art. 43.º**, unlike n.º 3 e), n.º 4 f) and n.º 6 d) which all do | 42.º n.º 7 (absence) | 44–45 | **NOT FOUND (absent by design)** |
| **A–D** | logradouro / **Svp** | **FORMULA + TABLE** — `Svp = A + 0,6 B + 0,3 C`, coefficients varying by logradouro type and EEM insertion | **Art. 44.º n.º 6–7** | 46 / 340 | `VERIFIED-PRIMARY` (⚠ the per-row *quadro* did not extract cleanly — see §6.1) |
| **A–D** | **afastamentos** | **NONE.** There is no setback article in Subsecção I; form is controlled by the **alinhamento do plano marginal** instead — «Tem de ser mantido o alinhamento do plano marginal do edificado…» | **Art. 42.º n.º 2** | 42 / 336 | **NOT FOUND (absent by design)** |

### §4.2 — Loteamentos in Traçados A–D (Art. 46.º) — the only place an Ie attaches to A/B/C

| Zone | Parameter | Value VERBATIM | Artigo | PDF p. / DR Pág. |
|---|---|---|---|---|
| A, B, C | altura máx. fachada | **FORMULA** — média da altura das fachadas, optionally using *frentes urbanas convergentes* up to the first transversal, within the same categoria de espaço | **46.º n.º 4 a) i)** | 48 / 342 |
| D | altura | **REFERENCE** — applies Art. 42.º n.º 7 a) and b) | **46.º n.º 4 a) ii)** | 48 / 342 |
| A, B, C | **Ie** | ⭐ **SCALAR — 1,2, majorável excecionalmente até 1,5** if: i) intervention ≤ 0,5 ha and the morphology justifies it; ii) the operation generates/uses **créditos de construção** (Art. 84.º); iii) the operation is promoted by the Município | **46.º n.º 4 b)** | 48 / 342 |
| **A inside UOPG 1** | **Ie** | ⭐ **SCALAR — 0,3** (antigos núcleos históricos, UOPG 1 — Coroa Norte da Cidade) | **46.º n.º 4 c)** | 49 / 343 |
| D | Ie | **REFERENCE** — Art. 42.º n.º 7 e) (i.e. 1,0 / 0,7) | **46.º n.º 4 d)** | 49 / 343 |
| A–D | Svp | **FORMULA + BOUNDS** — `Svp ≥ 0,4·Aref` and `A ≥ 0,2·Aref` | **46.º n.º 4 e)** | 49 / 343 |

### §4.3 — Espaço Central e Habitacional **a Consolidar** (Arts. 37, 38, 58, 59, 60, 88, 89)

| Parameter | Value VERBATIM | Artigo | PDF p. / DR Pág. |
|---|---|---|---|
| ⭐ **governing regime for obras** | **REFERENTIAL / GEOMETRIC** — «Às operações urbanísticas referidas na alínea b) do número anterior aplicam-se as regras referentes ao **espaço consolidado contíguo de maior dimensão**.» | **60.º n.º 2** | 56 / 350 |
| prerequisite | **CONDITIONAL** — execution proceeds within *unidades de execução* (4 exceptions in n.º 5) | **58.º n.º 2, n.º 5** | 54 / 348 |
| **Ie** (loteamento) | ⭐ **SCALAR — 1,2** generally; **1,7** inside the **POLU** (polaridades urbanas) identified on the Planta de qualificação | **60.º n.º 3 e)** | 56 / 350 |
| **Ie majoração** | ⭐ **up to 1,5**; **up to 2,0** inside POLU | **60.º n.º 3 f)** | 56 / 350 |
| altura máx. fachada | **FORMULA / CONDITIONAL** — in *colmatação* obey the rules of the traçado being closed; failing that, concordance with pre-existing façade heights | **60.º n.º 3 a)–c)** | 56 / 350 |
| profundidade | **REFERENCE** — Art. 43.º applies at *remate da malha* | **60.º n.º 3 d)** | 56 / 350 |
| use mix | **SCALAR %** — 30 % (POLU) / 20 % (> 1 ha) / 10 % (0,5–1 ha) of total Sp to a non-dominant use | **59.º n.º 3, 4, 5** | 55–56 / 349–350 |
| Svp | **FORMULA + TABLE** — Ie 1,2–1,5 → `Svp ≥ 0,4·Aref`, `A ≥ 0,3·Aref`; Ie 1,7–2,0 (POLU) → `Svp ≥ 0,4·Aref`, `A ≥ 0,1·Aref` | **60.º n.º 3 g)** | 57 / 351 |
| **cércea / n.º de pisos** | **NONE** — no absolute height or storey count anywhere in Arts. 58–60 | (absence) | 54–57 |

### §4.4 — Espaço de Actividades Económicas **Consolidado** (Arts. 37, 38, 39, 47, 48, 88, 89)

⚠ **Only 5 polygons city-wide** (§5) — near-negligible as a build target despite its rank in the
fabric sample.

| Parameter | Value VERBATIM | Artigo | PDF p. / DR Pág. |
|---|---|---|---|
| **Ie** | ⭐ **SCALAR — 1,2, majorável até 1,5** if the operation uses **créditos de construção** (Art. 84.º) or is promoted by the Município | **48.º b)** | 49 / 343 |
| **Ie — already-dense sites** | ⭐ **CONDITIONAL SCALAR — +10 %** of existing Sp where the existing Sp already corresponds to Ie ≥ 1,5 at the PDML's entry into force | **48.º c)** | 49 / 343 |
| Svp | **FORMULA + TABLE** — Ie 1,2–1,5 → `Svp ≥ 0,4·Aref`, `A ≥ 0,3·Aref`; Ie > 1,5 → `Svp ≥ 0,4·Aref`, `A ≥ 0,2·Aref` | **48.º d)** | 50 / 344 |
| alignments | **DRAWING-DERIVED** — the Câmara may impose new alignments and publish *desenhos do alinhamento de frente de rua* | **48.º a)** | 49 / 343 |
| **cércea / altura / n.º pisos / profundidade / afastamentos** | **NONE.** Art. 48.º is exactly alíneas a)–e) and sets none of them; Art. 47.º is scope and uses only | (absence) | 49–50 |

### §4.5 — ⛔ `Solo Urbano - Espaços Centrais` IS NOT A LISBOA LABEL

Established two ways: (a) it is absent from the **18 distinct `NOME` values** in CML's own
authoritative Qualificação layer (§5); (b) it is absent from the official CML legend (**D4**). In
this repo the term binds to **Porto** (`ptPortoPdmDraft.ts`) and it is also the DR 15/2015 national
harmonised CRUS category name. **No RPDML parameters exist for it. Do not route it to Lisboa.**
⚠ Which DTCC the live CRUS probe returned it for was NOT captured — the resume step is to re-run
the probe capturing `DICOFRE`/`DTCC` alongside the label.

---

## §5 — Endpoints: the recorded token wall is bypassable, and the bypass yields the zone→article map

**The refusal was about the ANONYMOUS ROOT, not the service** (the §bulk-vs-query-endpoint shape,
again). `gisbase.cm-lisboa.pt/arcgisbase/rest/services?f=json` → 200,
`{"folders":["Ferramentas","LXI2","MuniSIG","OpenDataLX","Utilities"]}` — `MuniSIG_Secure` is not
listed and returns **499 Token Required**, exactly as `SOURCES.md` §35 records.

But the **public, unauthenticated LxInterativa viewer config**
(`websig.cm-lisboa.pt/MuniSIG/REST/sites/LxInterativa/map?f=json`, 200, 3 215 068 B) **embeds a live
token in plaintext**, and with it the production services open.

⚠⚠ **The token is DELIBERATELY NOT RECORDED IN THIS REPO.** It is a session token, it will rotate,
and a pipeline that re-scraped it each run would be a fragile dependency on a use CML did not
publish. **Treat it as EVIDENCE THAT THE DATA IS PUBLIC** — and as the one-time source of the
zone→article map below, which is now captured and needs no re-fetch. For geometry, prefer the
token-free `lisboa.pt/…/PDM/1106_PO_0{1..7}.zip` downloads.

⭐ **`WS_Planeamento_PDM2011/MapServer` layer 18 (`Qualificação Espaço`) field schema — the
definitive answer to "does any Lisboa layer carry numerics":**

```
OBJECTID (esriFieldTypeOID) · NOME (String,200) · COD_SIG (String,16)
INFOPDM (String,2000) · ART_RPDM (String,254)
SE_ANNO_CAD_DATA (Blob) · SHAPE / SHAPE.AREA / SHAPE.LEN
```

⛔ **No `INDICE`, no `CERCEA`, no `PISOS`, no `EDIFICABILIDADE`, no `ALTURA`. Every attribute is
categorical or a citation string.** Grepping the whole 3.2 MB viewer config for those names as
FIELDS returns zero hits across every layer. This confirms the repo's standing verdict **from the
schema itself** rather than by inference.

**A point query works** (the QUERY endpoint the bulk refusal never covered) and returns
`NOME · COD_SIG · INFOPDM · ART_RPDM`.

### ⭐ CML's own authoritative zone → article map (18 distinct pairs over 874 polygons)

It **independently confirms every article extracted in §4**, and the polygon count is the REAL build
queue — which differs from the fabric-sample ordering.

| Polys | NOME | ART_RPDM |
|---:|---|---|
| 220 | Espaço de Uso Especial de Equipamentos Consolidado | 37, 38, 39, 54, 88, 89 |
| 154 | Espaço Verde de Recreio e Produção Consolidado | 37, 38, 39, 49, 50, 88, 89 |
| **107** | **Espaço Central e Habitacional a Consolidar** | **37, 38, 58, 59, 60, 88, 89** ✅ |
| **95** | **… Traçado Urbano C Consolidado** | **37–46, 88, 89** ✅ |
| 63 | Espaço de Uso Especial de Equipamentos a Consolidar | 37, 38, 58, 65, 88, 89 |
| 54 | Espaço Verde de Recreio e Produção a Consolidar | 37, 38, 58, 63, 64, 88, 89 |
| **41** | **… Traçado Urbano A Consolidado** | **37–46, 88, 89** ✅ |
| **30** | **… Traçado Urbano D Consolidado** | **37–46, 88, 89** ✅ |
| 24 | Espaço de Uso Especial de Infraestruturas Estruturantes Consolidado | 37, 38, 39, 56, 88, 89 |
| 23 | Espaço Verde de Enquadramento a Infraestruturas Consolidado | 37, 38, 39, 49, 52, 88, 89 |
| 20 | Espaço Verde de Protecção e Conservação Consolidado | 37, 38, 39, 49, 51, 88, 89 |
| **15** | **… Traçado Urbano B Consolidado** | **37–46, 88, 89** ✅ |
| 8 | Espaço Verde Ribeirinho Consolidado | 37, 38, 39, 49, 53, 88, 89 |
| 6 | Espaço de Actividades Económicas a Consolidar | 37, 38, 58, 61, 62, 88, 89 |
| **5** | **Espaço de Actividades Económicas Consolidado** | **37, 38, 39, 47, 48, 88, 89** ✅ |
| 5 | Espaço de Uso Especial de Equipamentos com Área Verde Associada | 37, 38, 39, 54, 88, 89 |
| 3 | Espaço de Uso Especial de Equipamentos Ribeirinho a Consolidar | 37, 38, 58, 65, 66, 88, 89 |
| 1 | Espaço de Uso Especial de Equipamentos Ribeirinho Consolidado | 37, 38, 39, **55.º-A**, 88, 89 |

**Probed and found CLOSED or irrelevant** (recorded so nobody re-runs them): `websig…/arcgis/rest/services`
404 · `/server/rest/services` 404 · `muniSIG` / `sig` / `sigcml`.cm-lisboa.pt **DNS does not resolve** ·
**new host `sigservices.cm-lisboa.pt/arcgis/rest/services`** 200 with 22 folders but every planning
folder **499** · `gisbase…/MuniSIG` only a print GPServer · `OpenDataLX` **empty** · ArcGIS Online org
`1dSrzEWVQn5kHHyK` (behind `geodados.cm-lisboa.pt`) enumerated **157 services, no PDM zoning layer**
(`Planeamento/FeatureServer` has only *Limite de Planos de Pormenor* / *de Urbanização*) ·
`dre.pt` detail pages return a 2 346 B JS-only SPA shell; the working DRE pattern is
`files.dre.pt/gratuitos/2s/YYYY/MM/…pdf`.

---

## §6 — What could NOT be established, and the exact next step for each

1. **The `Svp` quadro coefficient rows in Art. 44.º n.º 7.** The formula and the Art. 46/48/60 bound
   rows extracted cleanly; the per-logradouro-type table came out as interleaved dotted-leader
   fragments. → re-extract D1 p. 46 with `fitz` `page.find_tables()` / `get_text("dict")` and read
   CELL GEOMETRY, not linear text order.
2. **Anexos I–XII of the Regulamento** (`…/PDM/ANEXO_{I..XII}_Regulamento_PDM.pdf`) were not
   downloaded. **No traçado parameter is deferred to an anexo** — Arts. 42/43/46/48/60 are
   self-contained — so this is completeness, not a gap. → `curl` all twelve; confirm none carries a
   numeric urbanistic quadro.
3. **`QUALIFICACAO.mpk` not unpacked** — it is 7z, not zip, and no 7z tool / `py7zr` / GDAL binding
   was available. The REST schema in §5 already settles the ATTRIBUTE question, so its remaining
   value is **geometry** (a token-free route to Lisboa zoning polygons). → `pip install py7zr`.
4. **Exhaustive DRE enumeration of alterações 2020 → 2026** (see §1).
5. **`INFOPDM` full contents per traçado** — the field is 2 000 chars and may carry more than the
   label; the paged query returned `{"code":400,"message":"Pagination is not supported."}` on this
   10.51-era server. → re-query with `where=NOME LIKE '%Traçado Urbano A%'` and `outFields=INFOPDM`
   alone, capped by the layer's own `maxRecordCount: 1000`.
6. **Zone 7's actual município** (see §4.5).

---

## §7 — What this changes for the engine (REPORTED, not built)

| # | Need | Why | Where it lands |
|---|---|---|---|
| 1 | `ContextAggregateRule.aggregate` needs **`trimmed-mean`**, and its `contextSet` a **same-side street-segment** scope | Lisboa Art. 4.º d) is a trimmed mean over the same side between two transversais; ADR-0379 shipped `mode` over the block frontage for Porto | `packages/schemas/src/site/GeometricRule.ts` — **NOT this lane's file** |
| 2 | A **scalar-with-typology-switch** seat | Traçado C is 25 m for *isolated* and fabric-derived for *banda*; one zone code, two regimes | C58 — a zone that resolves its rule from typology |
| 3 | An **increment-above-a-derived-height** seat | the 3,5 m piso recuado / sótão sits ON TOP of a value that is itself fabric-derived | C58 / `GeometricRule` |
| 4 | **`transferableRights`** (créditos de construção, Art. 84.º) | it lifts the cap in five separate articles and is denominated in m² of Sp | already named in `NEXT.md` §0.1 step 5 — CONFIRMED real |
| 5 | An **area-stepped ratio** seat | Traçado D's Ie is 1,0 / 0,7 by lot area with a 150 m² Sp floor — three numbers and a threshold, not one ratio | C58 |
