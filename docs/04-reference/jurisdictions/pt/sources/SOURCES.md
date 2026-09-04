# Portugal (`pt`) — national data sources

**Status:** RESEARCH COMPLETE 2026-07-23 — legal instruments fully cited from primary sources
(`dre.pt`); data-endpoint leads documented but **NOT live-probed this session**. Every URL,
coverage figure, licence term, and field name marked `VERIFIED-LEAD` must be re-probed live before
any pipeline or pack may ship `confidence: structured`.

> **Trust gate (C58 §1.6 / C57 §1.4):** a field with NO citable source stays `null` in the pack
> and is listed under §B. A pack may not ship `confidence: structured` unless EVERY field it sets
> has a row in §A here. Confidence tiers: `VERIFIED-LIVE` (live-probed this session) /
> `VERIFIED-PRIMARY` (primary legal source, text read directly) / `CONVERGENT-SECONDARY` (multiple
> corroborating research sources, not primary text) / `INFERRED` / `COULD-NOT-VERIFY`.

---

## A.0 — `VERIFIED-LIVE` (probed 2026-07-31) — endpoints, schemas, and primary-PDF values

> **These rows were obtained from a live HTTP response or an extracted primary PDF on 2026-07-31.**
> Full evidence: [`../findings/PORTUGAL-DATA-RECON.md`](../findings/PORTUGAL-DATA-RECON.md).
> Several rows **supersede** entries in §A.2 below — superseded rows are marked there.

### A.0.1 — Endpoints

| Source / layer | Provides | Endpoint | HTTP | Auth | Licence | Confidence |
|---|---|---|---|---|---|---|
| **SNIC cadastral parcels** | INSPIRE CadastralParcel — `inspireid`, `geometry` (MultiSurface), `referencepoint`, `label`, `nationalcadastralreference`, `areavalue`, `validfrom`, `validto`, `beginlifespanversion`, `endlifespanversion`, `administrativeunit`, `id`. **`numberMatched=1789404`**, EPSG:3763 | `snicws.dgterritorio.gov.pt/geoserver/inspire/ows` (WFS 2.0; `DescribeFeatureType` **works**) | **200** | **NONE** | open | `VERIFIED-LIVE` |
| **CRUS — Carta do Regime de Uso do Solo** | **National VECTOR zoning polygons.** `ID · DTCC · Municipio · Classe · Categoria · Area_Ha · Designacao_PlantaOrdenamento · Escala_PlantaOrdenamento · Data_PublicacaoPDM · Fonte · Autor · Geometry`. EPSG:3763; GeoJSON/GML/CSV/KML/protobuf | `servicos.dgterritorio.pt/SDISNITWFSCRUS_<DICOFRE>_1/WFService.aspx` — verified `1312` (`gmgml:CRUS_Porto_V`) + `1106` (`gmgml:CRUS_Lisboa_V`); `0303` → **502** | **200** (148 s!) | NONE | CC-BY (`dados.gov.pt`) | `VERIFIED-LIVE` |
| **SNIT plan services (PDM/PP)** | Per-plan **RASTER** WMS 1.3.0. `GetFeatureInfo` returns 11 raster-metadata attrs incl. **`IDESTADO`, `VALIDADE`, `IDDEPOSITO`, `IMAGENAME`(.tif), `LEGENDLINK`(.jpg)`** — **no zoning attributes** | `servicos.dgterritorio.pt/SDISNITWMS<TYPE>_<DICOFRE>_<IDIGT>_<v>/wmservice.aspx` | **200** | NONE | open | `VERIFIED-LIVE` |
| **SNIG RNDG catalogue** | CSW 2.0.2 — `GetRecords`, `GetRecordById`, `DescribeRecord`, `GetDomain`, `Harvest`; outputSchemas incl. **ISO 19139 (`gmd:MD_Metadata`)** + **`gfc:FC_FeatureCatalogue`** + DCAT | `snig.dgterritorio.gov.pt/rndg/srv/por/csw` | **200** | NONE | open | `VERIFIED-LIVE` |
| **DGT GeoServer (base/thematic)** | CAOP (`cont_municipios` → `dtmn`, `municipio`, `nuts1/2/3`, `area_ha`, `n_freguesias`), COS, CLC, `altimetria:*`, `MDT50m:MDT50m`, RGN. **WFS *and* WCS DISABLED**; WMS + `GetFeatureInfo`→`application/json` work. **Zero planning + zero cadastral layers** (155-layer keyword scan) | `geo2.dgterritorio.gov.pt/geoserver/wms` | **200** | NONE | CC-BY 4.0 | `VERIFIED-LIVE` |
| **DGT CDD — national LiDAR / DTM** | 2024–25 campaign: 10 pts/m²; **exatidão planimétrica 30 cm, altimétrica 10 cm**; MDT+MDS at 0.5/2/10 m GeoTIFF; LAZ LAS 1.4 R15 pt-format 8, 1 km tiles; classes 2=Terreno, **6=Construções**, 9=Água, 26=Pontes. 13 STAC collections, `location:["continente"]` only | `cdd.dgterritorio.gov.pt/dgt-be/v1/collections` + `/search` (**open**); `/download/{sha256}` → **302 Keycloak** | **200** / **302** | STAC open; **tiles need free self-service account** (no key/secret) | **CC-BY 4.0** — quoted verbatim at `dgterritorio.gov.pt/dados-abertos` | `VERIFIED-LIVE` |
| **MDT10m national (zero-auth)** | Whole-country bare-earth 10 m DTM, single file **3,545,398,706 B** | `dgterritorio.gov.pt/sites/default/files/ficheiros-cartografia/MDT10m2024_PTcontinente.zip` | **200** | **NONE** | CC-BY 4.0 | `VERIFIED-LIVE` |
| **Porto municipal ArcGIS** | **ArcGIS Server 11.5, anonymous.** `PDM2021` folder (18 services); `PO1A_QS/MapServer/8` = *Qualificação do solo funcional*, 36 fields (`c_espaco`, `sc_espaco`, `designacao_po`…), EPSG:3763, queryable. **Zero numeric planning fields** | `fedservergeo.cm-porto.pt/arcgis/rest/services` | **200** | NONE | — | `VERIFIED-LIVE` |
| **Porto municipal WMS / CKAN** | GeoServer WMS 1.3.0, **361 layers**, `<Fees>none</Fees>`; CKAN **21 PDM datasets**, mostly **CC-Zero** | `geopdm.cm-porto.pt` · `opendata.porto.digital` | **200** | NONE | CC-Zero / ODbL | `VERIFIED-LIVE` |
| **Lisboa municipal zoning** | `MuniSIG_Secure/WS_Planeamento_PDM2011_TESTE_FGC/MapServer` | — | **ArcGIS 499 `Token Required`** | **TOKEN WALL** | — | `VERIFIED-LIVE` (as gated) |
| **BUPi RGG** | **3,471,456** polygons — **owner-declared, voluntary, NOT authoritative** | `geo.bupi.gov.pt/gisbupi/rest/services/opendata/RGG_DadosGovPT/MapServer/0/query` | **200** | NONE | — | `VERIFIED-LIVE` |
| `snit-mais.dgterritorio.gov.pt` | App root + `/api` gated; **static legend images remain public** | — | **401** (IIS) | CREDENTIAL WALL | — | `VERIFIED-LIVE` (as gated) |

### A.0.2 — Measured cadastral coverage (bbox `numberMatched`, `inspire:cadastralparcel`)

| Area | Parcels | Area | Parcels |
|---|---|---|---|
| **Porto (1312) municipality** | **0** | Porto *district* (wide) | 66,973 |
| **Braga (0303) municipality** | **0** | Braga *district* (wide) | 1 |
| **Lisboa (1106) municipality** | **1,747** | **Lisboa Baixa core** | **0** |
| Loulé (SiNErGIC) | 63,834 | Penafiel (SiNErGIC) | 23,906 |
| Tavira (SiNErGIC) | 11,015 | Algarve (wide) | 321,579 |
| Belmonte (0501) | 0 | North PT (very wide) | 164,906 |

> Zeros are **measured emptiness**, not query failure — identical query construction returns 66,973
> for the Porto district and 321,579 for the Algarve.

### §PORTO-SIGN-OFF — `PT_PORTO_PDM_CERTIFIED` (signed 2026-09-02; ~~gate remains SHUT by its own contract~~ **gate FLIPPED OPEN 2026-09-02, lane PORTO-FLIP — all four items closed below**)

**Signatory:** the founder (product owner), session directive 2026-09-02: *"I sign up."* — given
against the standing offer naming Porto's three assertions. Recorded by Claude (scribe only, L-449).

**What this signature covers NOW:**
1. **SCOPE (assertion 1) — SIGNED**: the Espaços Centrais parameter chain (Art. 32.º índice;
   cércea ≤ largura do arruamento with the 21 m cap and the moda-da-cércea override;
   profundidade 25/30 m; afastamento ≥ H/2 min 3 m) applies to the categorias this pack maps.
2. **MAPPING (assertion 2) — SIGNED**: the CRUS `categoria_2021` → PDMP categoria correspondence
   as drafted. *(Measured basis, lane PORTO-FLIP 2026-09-02: CRUS `classificacao_e_qualificacao`
   carries the PDMP's OWN Planta de Ordenamento legend verbatim — live probes returned «Solo
   Urbano  – Espaços centrais –  Área de frente urbana contínua tipo I» at 41.1493,−8.6109 and
   «… tipo II» at 41.1620,−8.6220 — so the correspondence is the regulamento's own words.)*
3. **ARTICLE PINS (assertion 3) — ~~PENDING~~ CLOSED 2026-09-02** by lane PT-ARTICLE-PINS,
   commit `eb63eeaf`: every formerly chapter-only row below is pinned to its Art. N.º + n.º +
   alínea with the verbatim sentence, dual-engine verified (pdf.js + poppler) against the
   sha256-pinned Regulamento PDF. Covered by this signature WITHOUT a further founder action,
   per the pre-authorization recorded above (*"continue with goal 3. and you have my sign
   off"*).
4. **SCHEMA (blocker 4) — ~~PENDING~~ CLOSED 2026-09-02** by **ADR-0379**
   (`context-aggregate` — a fabric statistic is a rule value), commit `ae6d9bed`: the
   `fabricDerivedHeight` seat this block named, as the C58 `GeometricRule` kind
   `context-aggregate` (extent-weighted mode over the frente urbana of cornice heights,
   `mean-ground-at-facade` datum; unavailable ≠ empty ≠ tie ≠ poisoned — ALL refuse).

**THE FLIP (2026-09-02, lane PORTO-FLIP):** with 1–4 closed, `PT_PORTO_PDM_CERTIFIED` is `true`,
citing THIS block + ADR-0379 (the L-449 discipline: the authority is this record, never the
flipping commit). Registered in `l449CertificationGates.ts` with the signature seat
`{doc: this file, anchor: '§PORTO-SIGN-OFF'}` — the l449 test DEREFERENCES the anchor, so
striking this block turns the gate red in CI. What the open gate authorises: the certified
coverage statement on Porto's zone-named refusal, and — in the FUC tipo I/II categorias — the
moda-da-cércea evaluation over a measured frente-urbana member set (`ptFrenteUrbana.ts`
extractor; members injected per ADR-0379 §4), publishing a value ONLY with its article chain
(Art. 24.º n.º 1 e) / Art. 27.º n.º 2 b) / Art. 3.º o) l) g)); where the member set cannot be
honestly constructed the card carries the ADR-0379 refusal NAMING the failed precondition —
never the 21 m cap alone. It does NOT register an envelope-drawing jurisdiction pack.

**Revocable** at any time: strike (not delete) this block — the shut branch is kept alive in
`ptPortoPdmDraftRefusal` and the l449 anchor dereference fails loudly.

### A.0.3 — Porto PDM numeric values (`VERIFIED-PRIMARY`, text extracted 2026-07-31)

Source: *Plano Diretor Municipal — Regulamento — Janeiro 2023*,
`pdm.cm-porto.pt/documents/121/Regulamento_PDMPorto.pdf` (HTTP 200, 1,641,985 B, 100 pp, **text PDF**,
319,459 chars extracted).

> **Re-fetched 2026-09-02 (lane PT-ARTICLE-PINS)** for the article-pinning pass: byte-identical
> (1,641,985 B, 100 pp), **sha256
> `a9383f794a059d87e1bd5629a3d9ea26240f713fab72c0c970cd7bb6baa3e0d1`** (no earlier pin existed —
> this is now the pin). Extracted via `tools/ordinance-ingest` (pdf.js path, 306,385 chars —
> extractor-dependent count; the 319,459 above was a different extractor over the same bytes) and
> **cross-verified with poppler `pdftotext`** page-by-page: every pinned sentence below was
> re-found independently on its cited page. Page refs are **PDF page** (fólio = printed footer,
> PDF − 2).

| Field | Value | Article | Confidence |
|---|---|---|---|
| `índice de edificação` — new buildings (Espaços Centrais family) | **1** | **Art. 32.º n.º 3 a)**: «A área de edificação admitida não pode ser superior à resultante da aplicação de um índice de edificação de 1» (PDF p. 20, fólio 18). ⚠ SCOPE FINDING (founder review; value unchanged): Art. 32.º sits in **Subsecção V — Área de Blocos Isolados de Implantação Livre** ONLY; the Field's "(Espaços Centrais family)" phrasing overstates — the other four subcategories (Histórica, FUC I/II, Moradia) carry **no índice de edificação** and are morphology-governed (Arts. 20/24/27/30). n.º refined 2026-09-02 (lane PT-ARTICLE-PINS) | `VERIFIED-PRIMARY` |
| `índice de edificação` — existing below 1 may extend to 1, if `índice de impermeabilização ≤ 0,6` | **1 / 0,6** | **Art. 32.º n.º 2** — Blocos Isolados de Implantação Livre: «Em edifícios existentes cujo índice de edificação seja inferior a 1, admite-se a ampliação até este valor, desde que não resulte num índice de impermeabilização superior a 0,6 na área da parcela.» (PDF p. 20, fólio 18). n.º refined 2026-09-02 (lane PT-ARTICLE-PINS) | `VERIFIED-PRIMARY` |
| `índice de edificação` máximo — Área de Atividades Económicas **Tipo I**; impermeável ≤ 70 % | **1,8** | **Art. 36.º** | `VERIFIED-PRIMARY` |
| `índice de edificação` máximo — **Tipo II**; impermeável ≤ 70 % | **1,4** | **Art. 38.º** | `VERIFIED-PRIMARY` |
| **Cércea ≤ largura do arruamento** confrontante | street width | **Art. 27.º n.º 1 g)** — Frente Urbana Contínua **tipo II**: «A cércea confinante com a via pública não pode exceder a largura do arruamento confrontante, medida entre os limites do espaço público dominante ou estabelecido, admitindo-se pisos recuados, desde que tais sejam dominantes nessa frente urbana, ou sirvam de colmatação a empenas de edifícios existentes a manter…» (PDF p. 18, fólio 16). ⚠ Scope: tipo II ONLY — in FUC tipo I the governing height rule is the **moda da cércea** (Art. 24.º n.º 1 e): «A cércea resultante não ultrapasse a moda da cércea da frente urbana do quarteirão onde se situa»). Art. N.º pinned 2026-09-02 (lane PT-ARTICLE-PINS) | `VERIFIED-PRIMARY` |
| Where public-space cross-section **> 21 m** → cércea máx **21 m**, *unless moda da cércea is higher* | **21 m** | **Art. 27.º n.º 2 b)** — FUC tipo II: «Quando o perfil transversal do espaço público ou via pública confinantes com uma frente urbana seja superior a 21 metros, a cércea máxima admitida é de 21 metros, exceto quando a moda da cércea for superior, respeitando-se essa moda, ou quando já existir uma cércea estabelecida, ou a estabelecer em instrumento adequado, para essa frente urbana.» (PDF p. 18, fólio 16). Art. N.º pinned 2026-09-02 (lane PT-ARTICLE-PINS) | `VERIFIED-PRIMARY` |
| **Profundidade** máx from alinhamento (two subcategories) | **25 m / 30 m** | **Art. 24.º n.º 1 d)** (25 m, FUC tipo I) + **Art. 27.º n.º 1 d)** (30 m, FUC tipo II): «No piso situado à cota do logradouro, admite-se o prolongamento construtivo do edifício, não podendo ultrapassar a profundidade de 25 metros medidos a partir do alinhamento da frente urbana e quando não resulte num índice de impermeabilização superior a 0,7 da área da parcela» (PDF p. 17, fólio 15; Art. 27.º wording identical with **30 metros**, PDF p. 18). ⚠ Scope: both alíneas cap the **piso à cota do logradouro** extension — the dominant body's upper storeys follow the tardoz alignment (alínea b) of each article), not the 25/30 m figure. Art. N.º pinned 2026-09-02 (lane PT-ARTICLE-PINS) | `VERIFIED-PRIMARY` |
| **Afastamento** of upper storeys to plot limits | **≥ H/2, min 3 m** | **Art. 30.º n.º 1 d)** — Área de Edifícios de Tipo **Moradia**: «Os pisos superiores do edifício devem garantir um afastamento aos limites do prédio, igual ou superior à metade da sua altura, com o mínimo de 3 metros, exceto nas situações de colmatação de empena constituídas, ou que venham a ser constituídas nas parcelas confinantes.» (PDF p. 19, fólio 17). Art. N.º pinned 2026-09-02 (lane PT-ARTICLE-PINS) | `VERIFIED-PRIMARY` |
| Max storeys above ground (stated subcategory); in colmatação set by moda da cércea | **3** | **Art. 30.º n.º 1 c)** — Área de Edifícios de Tipo **Moradia**: «O número máximo de pisos acima do solo é três, com exceção de situações de colmatação de conjuntos consolidados, em que o número de pisos é definido em função da moda da cércea» (PDF p. 19, fólio 17). ⚠ Additional carve-out: **Art. 30.º n.º 3** — the max may be exceeded «no âmbito da concretização de uma UOPG» (PDF p. 20). Art. N.º pinned 2026-09-02 (lane PT-ARTICLE-PINS) | `VERIFIED-PRIMARY` |
| `índice de permeabilidade` (logradouros); ancillary max | **0,3** / **10 m²** | Art. 25.º (FUC tipo I; **Art. 28.º n.º 1** carries the identical 0,3 / 10 m² rule for FUC tipo II — noted 2026-09-02, lane PT-ARTICLE-PINS) | `VERIFIED-PRIMARY` |
| Roof pitch max | **30°** | **Art. 24.º n.º 1 f)** — FUC tipo I, água com pendente para o arruamento: «Na solução de cobertura inclinada, com uma das águas com pendente para o arruamento, o arranque da laje de cobertura deve coincidir com a inserção entre planos de fachada e a laje de teto do último piso e a sua inclinação não deve ser superior a 30º» (PDF p. 17, fólio 15). Art. N.º pinned 2026-09-02 (lane PT-ARTICLE-PINS) | `VERIFIED-PRIMARY` |
| Parcel-size exemption from frontage implantation | **> 2000 m²** | **Art. 30.º n.º 2** — Área de Edifícios de Tipo **Moradia**: «Excetuam-se da alínea a) do número anterior as parcelas com área superior a 2000 m2, admite-se qualquer implantação, desde que garantidas as formas de relação das frentes da parcela confinantes com o espaço público que se mostrem dominantes na ferente urbana onde se localiza a parcela.» [sic «ferente»] (PDF pp. 19–20, fólios 17–18). Art. N.º pinned 2026-09-02 (lane PT-ARTICLE-PINS) | `VERIFIED-PRIMARY` |
| **`área de edificação` (ae) definition** | sum of all storey areas, **excluding** uncovered terraces, non-glazed balconies, balconies open to exterior, publicly-usable covered open space, attics without regulation headroom | **Art. 3.º d)** | `VERIFIED-PRIMARY` |
| **`cércea` definition** | vertical dimension from **mean ground level at the façade alignment** to top of eave/parapet/terrace guard, **including** recessed storeys, **excluding** chimneys, lift machine rooms, water tanks | **Art. 3.º g)** | `VERIFIED-PRIMARY` |
| **`índice de edificação` definition** | ratio of `área de edificação` (excluding collective-equipment areas ceded to the município) to parcel area or plan area | **Art. 3.º m)** | `VERIFIED-PRIMARY` |
| **`moda da cércea` definition** | the cércea with the greatest extent along a built urban frontage | **Art. 3.º o)** | `VERIFIED-PRIMARY` |
| **`frente urbana` definition** | plane of façades fronting a public way, between two successive intersecting public ways | **Art. 3.º l)** | `VERIFIED-PRIMARY` |
| Perequação article series | `edificabilidade média / abstrata / concreta`; UT for perequação | **Arts. 131–135** (headings verified; **text NOT read**) | `VERIFIED-PRIMARY` (headings only) |
| `índice de utilização` in Porto regulamento | **0 occurrences** | — | `VERIFIED-PRIMARY` (measured absence) |
| `altura da edificação` in Porto regulamento | **0 occurrences** | — | `VERIFIED-PRIMARY` (measured absence) |

> ⚠ **`edificab_m` in Porto's `cc_czp.gpkg` (1.18 / 0.67 / 0.25) is an `edificabilidade média` over
> exactly THREE city-wide perequação macro-zones.** It is a compensation reference index, **NOT** a
> per-parcel FAR. **Do not wire it as an envelope value.**


### A.0.3b — Porto PDM: the COMPLETENESS read (`VERIFIED-PRIMARY`, whole-document, 2026-09-04)

<!-- Lane ENVELOPE-IBERIA. §A.0.3 above pins the values that EXIST. This section answers the
     question §A.0.3 never asked — WHAT IS MISSING — because "can a complete envelope be drawn?"
     cannot be answered from a table of the rows that happen to be present. -->

**Method (reproducible).** `curl -sSL` → HTTP 200, **1 641 985 B**, sha256
`a9383f794a059d87e1bd5629a3d9ea26240f713fab72c0c970cd7bb6baa3e0d1` — **byte-identical to the §A.0.3
pin**. Extracted twice: poppler `pdftotext` 4.00 (100 pp, **309 649 chars**) and `pdfjs-dist`
5.7.284 (100 pp, **307 561 chars**). **All 14 load-bearing sentences re-found independently on their
cited page in BOTH engines; all negative term counts identical in both.** Whole document indexed:
**164 articles**, every heading mapped to its PDF page; Arts. 3, 5, 14–16, 17–38, 40–43, 131–135,
161–164 read **in full**, not grepped.

#### Four articles §A.0.3 did not carry

| Field | Value | Article (verbatim) | Confidence |
|---|---|---|---|
| **Blocos Isolados — cércea** | ⛔ **QUALITATIVE ONLY, no number** | **Art. 32.º n.º 6**: «A cércea a adotar deve assegurar a integração urbanística com os edifícios e zonas envolventes.» (PDF p. 20) | `VERIFIED-PRIMARY` |
| **Blocos Isolados — impermeabilização (GENERAL, not just extensions)** | **≤ 0,6** of the parcel | **Art. 32.º n.º 4**: «O índice de impermeabilização não pode ser superior a 0,6 na área da parcela.» (PDF p. 20) — ⚠ **materially BROADER than the n.º 2 row §A.0.3 pins**, which applies only to extensions of existing sub-1 buildings | `VERIFIED-PRIMARY` |
| **Moradia — impermeabilização** | **≤ 0,6** of the parcel | **Art. 30.º n.º 1 b)**: «O índice máximo de impermeabilização é de 0,6 da área da parcela, devendo a área remanescente ser ocupada por coberto vegetal e espaços de circulação e de estadia permeáveis, exceto as obras de edificação em parcelas de muito reduzidas dimensões…» (PDF p. 19) — ⛔ **impermeabilisation, NOT footprint. Do not wire as occupation.** | `VERIFIED-PRIMARY` |
| **AAE Tipo I / Tipo II — the verbatim §A.0.3 lacked** | **1,8** / **1,4**, both defeasible; **área impermeabilizada ≤ 70 %** | **Art. 36.º n.º 1**: «O índice de edificação máximo admitido é de 1,8 o qual poderá assumir outros valores desde que justificados no âmbito de uma UOPG.» · **n.º 2**: «A área impermeabilizada não poderá ser superior a 70% da área da parcela.» · **Art. 38.º n.º 1/n.º 2** identical with **1,4** (both PDF p. 21) | `VERIFIED-PRIMARY` |

⛔ **THE 70 % IS `área impermeabilizada` — PAVING INCLUDED — AND IS *NOT* `ocupação`/`implantação`.**
Three independent confirmations: (1) the words themselves, the same family as the *índice de
impermeabilização* of Arts. 24/27/30/32; (2) the regulamento HAS a separate footprint vocabulary
and uses it deliberately elsewhere — **Art. 42.º n.º 2**: «a **área de implantação** total das
construções não ultrapasse **20 %** da área total da parcela» (p. 22), **Art. 51.º n.º 2**: «a sua
**área de implantação** não pode exceder **25 %** da área da parcela» (p. 24); (3) **`índice de
ocupação` and `taxa de ocupação` are 0 occurrences doc-wide in both engines — Porto has no
occupation index at all.**

#### The measured absences (counts identical in both engines)

| Term | Occurrences in 100 pp | What it means |
|---|---:|---|
| **`afastamento`** (and the stem `afast*`) | **1** | The ONLY setback rule in the whole regulamento is **Art. 30.º n.º 1 d)**, Moradia. There is no general one. |
| **`cércea máxima`** | **1** | The FUC-II 21 m cap (Art. 27.º n.º 2 b)). It is the document's ONLY hard metric height cap. |
| `índice de ocupação` · `taxa de ocupação` · `ocupação máxima` · `implantação máxima` | **0 each** | No occupation index exists. |
| `número máximo de pisos` | **3** | Art. 30.º n.º 1 c), Art. 30.º n.º 3, Art. 47.º n.º 3 — **none in Art. 32.º**. |
| `profundidade` | **3** | pp. 17–18 only (Arts. 24.º/27.º, FUC I/II). **None in Art. 30.º.** |
| **`pé-direito`** | **1** | **Art. 3.º d) iii**, «Sótão sem pé-direito regulamentar para fins habitacionais» — a REFERENCE with **no value**. And the external referent is never named: **`RGEU` = 0, `Regulamento Geral das Edificações` = 0, `38382` = 0.** ⇒ **"3 pisos" CANNOT be converted to metres from this document.** |
| `altura` | **4** | Art. 3.º c) (an extent-based mode, no metric), p. 19 (the H/2 setback), pp. 34/41 (qualitative heritage/coastal). The only `2,40`/`2,70` in the document are **footway widths** (Art. 113.º, p. 48). |

#### No general chapter supplies the defaults — affirmatively, not merely unlocated

Every candidate general chapter was read in full: **Título I Disposições Gerais** (Arts. 1–6, pp.
7–10) · **Cap. III Secção I Disposições Gerais** — the one directly above Espaços Centrais, and it
is **Arts. 14, 15, 16 ONLY** (pp. 13–15), all qualitative · **Título V Secção I Edificabilidade**
(Arts. 131–135, perequação only) · **Título VI Disposições Gerais** (Arts. 161–164). **None sets an
envelope default.** The residual clause sends omissions OUTSIDE this instrument:

> **Art. 164.º — Omissões**: «A qualquer situação não prevista nas presentes disposições
> regulamentares aplicar-se-á o disposto na demais legislação vigente e nos regulamentos municipais
> aplicáveis.» (PDF p. 71)

⚠ **And a correction to §A.0.3's `edificab_m` warning, which was RIGHT but whose figures differ from
the article's.** Art. 134.º n.º 1 gives the *edificabilidades médias* as **1,2 / 0,7 / 0,25**
(p. 55); the `cc_czp.gpkg` values §A.0.3 records are **1.18 / 0.67 / 0.25**. **The GPKG is not a
verbatim copy of the article.** Art. 135.º n.º 1 subordinates them outright — «A edificabilidade de
cada prédio … respeita as disposições (quantitativas e qualitativas) estabelecidas pelo Plano» —
which confirms the standing instruction not to wire `edificab_m` as a FAR.

#### ⛔ BOTTOM LINE — no Porto subcategory yields a COMPLETE envelope

**For NO subcategory does the Regulamento supply footprint + height + intensity with nothing missing
and nothing inferred**, and the missing leg is almost always **HEIGHT IN METRES**.

| Subcategory | Has | Missing |
|---|---|---|
| **Blocos Isolados** (32.º) | índice 1 · Iimp 0,6 | height (only the qualitative n.º 6) · storeys · setback · footprint ⇒ **vertically unbounded** |
| **Moradia** (30.º) | 3 storeys · afastamento H/2 min 3 m · Iimp 0,6 | metres · índice · footprint · depth. ⚠ **AND THE SETBACK IS CIRCULAR**: it is H/2 on an `H` the article never bounds — a function of a free variable, not merely an incomplete rule. |
| **AAE I / II** (36.º/38.º) | índice 1,8 / 1,4 · Iimp 70 % | ⛔ **no height rule whatsoever** |
| **Área Histórica** (20.º) | — | entirely qualitative |
| **FUC I** (24.º) | profundidade 25 m · Iimp 0,3 · roof 30° | height = **the moda da cércea alone** — a measured neighbourhood statistic (the ADR-0379 `context-aggregate` seat), not a stated value |
| **FUC II** (27.º) | ⭐ **21 m** (the document's only hard metric cap) · profundidade 30 m · Iimp 0,3 | no índice; and the 21 m fires ONLY where the street profile exceeds 21 m **and** yields to a higher moda |

**Compounding this, a UOPG override defeats the stated figure in Arts. 30.º n.º 3, 32.º n.º 3 b),
36.º n.º 1 and 38.º n.º 1.**

⇒ **PORTO IS CATEGORY C (LEGAL-DATA BLOCKER), NOT CATEGORY A (GATE-ONLY)** under the founder's
2026-08-03 publication authorization, whose disqualifiers name *"missing height rule"* explicitly.
**No signature can open an envelope-drawing Porto pack**, because any complete Porto envelope
requires importing at least one number this instrument does not contain. The gaps are STRUCTURAL,
not editorial — `afastamento` once in 100 pages, `cércea máxima` once, `índice de ocupação` never,
`pé-direito` once and only as an unnamed external reference, and Art. 164.º declining to supply
defaults at all.

### A.0.4 — Lisboa créditos de construção (`VERIFIED-PRIMARY`)

| Field | Value | Confidence |
|---|---|---|
| Instrument | *Regulamento Municipal que aprova o Sistema de Incentivos a Operações Urbanísticas com Interesse Municipal* — Deliberações **53/AM/2013** + **60/AM/2013** of 21 May; **3.º Suplemento do Boletim Municipal n.º 1006, 30 May 2013** (58 pp, text PDF) | `VERIFIED-PRIMARY` |
| Mechanism | Credits add m² of **`superfície de pavimento`**, capped by the max **`índice de edificabilidade`** per `categoria de espaço` + `traçado urbano` in the **RPDML**; represented by transferable **Títulos** | `VERIFIED-PRIMARY` |
| **Suspension (PARTIAL)** | **Art. 2.º n.º 1 alínea g) and Art. 5.º n.º 2 alínea i) SUSPENDED** by **Deliberação 415/AML/2022**, 2.º Supl. Boletim Municipal n.º 1486, **11 Aug 2022**. **The regime as a whole remains in force.** | `VERIFIED-PRIMARY` |
| "PDM Arts. 84/88/89" (prior claim) | **NOT confirmed** in the document read | **downgraded to `ASSERTED-UNVERIFIED`** |
| Lisboa vocabulary | `índice de edificabilidade` · `superfície de pavimento` · `traçados urbanos` | `VERIFIED-PRIMARY` |

> ⭐ **THE RPDML’S OWN NUMERIC PARAMETERS ARE NOW EXTRACTED — 2026-09-04, lane ENVELOPE-IBERIA.**
> They live in [`LISBOA-RPDML-PARAMETERS.md`](./LISBOA-RPDML-PARAMETERS.md) (republicação integral,
> Decl. Retif. 703/2020, sha256-pinned; every value with its artigo, verbatim sentence and PDF page).
> **Headline: three of the four highest-volume Lisboa zones state NO índice at all and their height
> is a TRIMMED MEAN of the neighbours’ façade heights (Art. 4.º d)) — Lisboa is not representable
> as scalars.** ⚠ And `superfície de pavimento` is **NOT** the national `Ac`: Sp EXCLUDES varandas
> and covered collective exterior space, `Ac` INCLUDES them.

### A.0.5 — DICOFRE (`VERIFIED-LIVE`, DGT CAOP `cont_municipios`)

| City | `dtmn` | area_ha | n_freguesias |
|---|---|---|---|
| **Porto** | **1312** (repo says `1315` — **defect**) | 4142.02 | 7 |
| Lisboa | 1106 ✓ | 10005.43 | 24 |
| Braga | 0303 ✓ | 18339.95 | 37 |

---

## A — VERIFIED / CITED

### A.1 — Legal instruments (primary; `dre.pt`)

| Field (pack key / legal rule) | Value | Unit | Governing instrument | Document title + date | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| National IGT hierarchy | RJIGT — Regime Jurídico dos Instrumentos de Gestão Territorial | — | Decreto-Lei n.º 80/2015, 14 Apr 2015 | "Aprova o Regime Jurídico dos Instrumentos de Gestão Territorial" | `dre.pt` — search DL 80/2015 | `VERIFIED-PRIMARY` |
| National solo classification criteria | DR 15/2015 — criteria for solo urbano / rústico qualification; uniform national application per Art. 74(4) RJIGT | — | Decreto Regulamentar n.º 15/2015, 19 Aug 2015 | "Critérios de classificação e reclassificação do solo e critérios de qualificação" | `dre.pt` — search DR 15/2015 | `VERIFIED-PRIMARY` |
| Abolition of solo urbanizável | Post-2015 reform eliminates "solo urbanizável" as an operative category nationwide | — | DR 15/2015 (implementing Lei n.º 31/2014) | Same document | `dre.pt` | `VERIFIED-PRIMARY` |
| Top-level solo categories (hard-code) | Only **solo urbano** and **solo rústico** — no intermediate class post-2015 | — | DR 15/2015 | Same | `dre.pt` | `VERIFIED-PRIMARY` |
| Art. 74(4) RJIGT uniform criteria mandate | Dominant-use definitions and categories of solo urbano/rústico MUST obey uniform criteria applicable to the whole national territory | — | RJIGT Art. 74(4), DL 80/2015 | Same | `dre.pt` | `VERIFIED-PRIMARY` |
| Licensing-track split (§34/RNU analogue) | Comunicação prévia → áreas cujos parâmetros urbanísticos se encontrem efetivamente definidos; Full licenciamento prévio → areas without precise urbanistic instruments | — | RJUE Art. [relevant article], DL 555/99 as reformed by DL 10/2024 | "Regime Jurídico da Urbanização e Edificação" | `dre.pt` — DL 555/99 + DL 10/2024 | `VERIFIED-PRIMARY` |
| Unified cadastro predial regime | DL 72/2023 unifies CGPR and SiNErGIC into one "cadastro predial" regime; operative 21 Nov 2023; every prédio receives a NIC (Número de Identificação do Prédio) | — | Decreto-Lei n.º 72/2023, 21 Nov 2023 | "Regime jurídico da constituição e atualização do cadastro predial" | `dre.pt` — DL 72/2023 | `VERIFIED-PRIMARY` |
| Cadastral data as rebuttable presumption | Data on a cadastred prédio "constitute a presumption of its real location, geometric configuration, and area for all legal purposes, without prejudice to the right of rectification" | — | DL 72/2023 | Same | `dre.pt` | `VERIFIED-PRIMARY` |
| Heritage ZGP radius | 50 m automatic general protection zone from the external limits of any pending-classification immovable heritage asset | m | Lei n.º 107/2001 + DL n.º 309/2009 | "Lei de Bases do Património Cultural" + "Procedimentos de classificação de bens imóveis" | `dre.pt` | `VERIFIED-PRIMARY` |
| Heritage ZEP | Must be fixed simultaneously with classification or within 18 months; variable extent (not a fixed radius); may include ZNA (non aedificandi subzone) | — | DL 309/2009 | Same | `dre.pt` | `VERIFIED-PRIMARY` |
| RGEU habitability baseline | Nationwide habitability minimums (natural light, room dimensions, ventilation); referenced by PDMs as minimum habitability floor | — | Regulamento Geral das Edificações Urbanas (RGEU), 1951, Decreto-Lei n.º 38382 | Still partially in force | `dre.pt` | `VERIFIED-PRIMARY` |
| RGEU does NOT set a national setback formula | RGEU does not define a height-proportional setback from boundary (unlike Germany's LBO Abstandsflächen) — setbacks (afastamentos) are per PDM only | — | RGEU (1951) — absence confirmed by research | Same | — | `VERIFIED-PRIMARY` |
| CGPR coverage (cadastral) | 127 municípios (118 mainland + 9 autonomous regions) under Cadastro Geométrico da Propriedade Rústica — primarily rural (rústico) land; some urban parcels lacking independent economic/legal standing | count | CGPR regime (DL pre-2023) / DL 72/2023 Art. X | DGT SNIC documentation | `snig.dgterritorio.gov.pt` | `CONVERGENT-SECONDARY` |
| SiNErGIC pilot coverage | 7 municípios: Loulé, Oliveira do Hospital, Paredes, Penafiel, São Brás de Alportel, Seia, Tavira | list | SiNErGIC / CPE regime, unified under DL 72/2023 | DGT documentation | `dgterritorio.gov.pt` | `CONVERGENT-SECONDARY` |
| No-cadastro municípios | ~174 municípios have no cadastro predial; rely on BUPi voluntary/citizen-submitted graphic representation (RGG) | count | Research finding | Multiple corroborating sources | — | `CONVERGENT-SECONDARY` |
| BUPi is NOT a parcel-geometry source | BUPi (Balcão Único do Prédio) = rural/mixed ownership registration; voluntary, citizen-submitted; NOT authoritative parcel geometry | — | Research finding | Confirmed by multiple sources | `bupi.gov.pt` | `VERIFIED-PRIMARY` (negative) |

### A.2 — Data endpoints (VERIFIED-LEAD; **superseded in part by §A.0 — live-probed 2026-07-31**)

> **⚠ SUPERSEDED ROWS — do not use these without reading §A.0 first:**
> - **SNIT row** — the endpoint `snit-mais.dgterritorio.gov.pt` is **401** to anonymous clients and is
>   **not** a GeoServer. The real hosts are `servicos.dgterritorio.pt` (WMS rasters + **CRUS WFS**).
>   *"PDM zone polygons + WFS"* is wrong as stated: plan services are **raster**; the vector route is **CRUS**,
>   and it carries **no numeric attributes**. The row's own caveat — *"numeric rules likely PDF-only"* —
>   is now **CONFIRMED**.
> - **SNIC / Carta Cadastral row** — a live open INSPIRE WFS **does** exist (§A.0.1) and needs no
>   registration. Its warning *"do NOT assume Lisbon/Porto city-centre coverage"* is **CONFIRMED with
>   numbers** (§A.0.2): Porto **0**, Lisboa **1,747** / **0** in core.
> - **DGT CDD row** — CONFIRMED and extended: accuracy is **30 cm planimetric / 10 cm altimetric**
>   (DGT *Ficha Técnica*), licence **CC-BY 4.0**, class **6 = Construções**. A **zero-auth national
>   MDT10m** exists. High-res tiles need a **free account (no key/secret)**. Continental only.
> - **CAOP / COS / CRUS / Orthophoto "OGC API platform" rows** — the *platform* framing is **not**
>   what was found. CAOP/COS/altimetria are served from `geo2.dgterritorio.gov.pt/geoserver` where
>   **WFS and WCS are both DISABLED** (WMS + `GetFeatureInfo`→JSON only). **CRUS is a separate SNIT
>   WFS**, not a collection on a unified OGC API. **No OGC API base URL was found.**
> - **Lisbon CML 3D model row** — licence still `COULD-NOT-VERIFY`; additionally the municipal PDM
>   zoning service returns **ArcGIS 499 Token Required**.

> **DGT OGC API platform (2026-07-30 expert review — `CONVERGENT-SECONDARY`, pending-probe).** The
> review reports that DGT delivers its national layers through a coherent **OGC API platform**
> (`dgterritorio.gov.pt` / `snig.dgterritorio.gov.pt`), **CC BY 4.0 platform-wide**. This upgrades
> several rows below from `VERIFIED-LEAD` to `CONVERGENT-SECONDARY` (corroborated by an expert
> second source, still not live-probed). See `../PORTUGAL-GEOSPATIAL-DATA-INVENTORY.md` for the full
> inventory + §Probe steps. **A corroborated source is not a wired/probed source — confirm the OGC
> API base URL + each collection by direct probe before any row gates production or a RATE cell.**

| Source / layer | Provides | Endpoint / locator | Access | Confidence | Licence / attribution | Currency | Notes |
|---|---|---|---|---|---|---|---|
| **SNIC / DGT** — Carta Cadastral (parcel geometry + NIC) | Parcel geometry + area + NIC identifier, per-prédio | INSPIRE WMS/WFS via SNIG (`snig.dgterritorio.gov.pt`); per-parcel download Shapefile / GeoPackage / DXF / GeoJSON | Open (EU High-Value Dataset, Reg. 2023/138); keyless or registration TBD | `VERIFIED-LEAD` | Open (HVD mandate — specific attribution string TBD) | In-progress national update under DL 72/2023 | OGC API planned 2025 — verify if live. Urban parcel coverage limited to CGPR/SiNErGIC munis (~134). Do NOT assume Lisbon/Porto city-centre coverage. |
| **SNIT** — national PDM portal | PDM zone polygons + regulation PDF links for all mainland PDMs since Jan 2008 | `snit-mais.dgterritorio.gov.pt` — WMS/WFS | Open (INSPIRE) | `VERIFIED-LEAD` | Open | Living dataset; PDM amendments appear as they are published | WFS field names NOT confirmed. Numeric rules (índice/cércea) likely PDF-only — probe WFS attributes. |
| **DGT CDD** — national LiDAR (PRR 2024–2025) | LAZ point cloud (10 pts/m², classified); DTM 50 cm GeoTIFF; DSM 2 m GeoTIFF; ~90% continental coverage | `cdd.dgterritorio.gov.pt` | Open — "sem qualquer tipo de restrição" | `VERIFIED-LEAD` | No restrictions stated | Apr 2024 – Mar 2025 campaign; NW mainland gap (~10%, rolling completion) | RMSE-Z NOT published by DGT — do not quote PNOA parity. Class codes vs ASPRS mapping NOT confirmed — verify before wiring CHM extraction. DGT CDD Downloader QGIS plugin available. |
| **BGE (INE)** — Base Geográfica de Edifícios | National vector building footprints; mainland + Madeira/Azores; 1:10,000 | INE open data portal (`ine.pt`) | CC-BY-4.0 | `VERIFIED-LEAD` | CC-BY-4.0 — "Instituto Nacional de Estatística" | Census-vintage; exact year to confirm | Built for census population/dwelling counting. Height / storey attribute NOT confirmed — verify before assuming a `HAUTEUR`-equivalent field. |
| **DGPC Atlas do Património Classificado** | ZGP / ZEP / ZNA / Restrições — 4 distinct queryable heritage layers | `patrimoniocultural.gov.pt` — DGPC geoportal | Open | `VERIFIED-LEAD` | Open; attribution "Direção-Geral do Património Cultural (DGPC)" | Living dataset | Variable ZEP radius per asset — NOT a fixed circle. National single service, no per-region gating. |
| **SNIRH + DGT hydrography** | National water-resources system + hydrography network | `snirh.apambiente.pt` / SNIG INSPIRE | Open (INSPIRE) | `VERIFIED-LEAD` | Open | Living | Do NOT derive water surfaces from LiDAR (NIR absorption) — use SNIRH geometry + DTM elevation referencing. |
| **COS / COSc (DGT)** — land cover | National land-cover (Carta de Uso e Ocupação do Solo); COSc = AI/ML-derived, more frequent | **DGT OGC API platform** (`dgterritorio.gov.pt` / `snig.dgterritorio.gov.pt`) — *review upgrades from SNIG WMS/WFS lead* | Open | `CONVERGENT-SECONDARY` — 2026-07-30 review upgrade; pending-probe | **CC BY 4.0** *(review; DGT platform-wide — pending-probe)* | Multi-year; COSc more frequent | Too coarse for individual park boundaries — use as fallback/district-scale context only. Confirm OGC API + CC BY 4.0 by direct probe before it gates production. |
| **CAOP (DGT)** — administrative boundaries | distrito + concelho + freguesia polygons + DICOFRE — jurisdiction routing (== DE AGS / FR INSEE) | **DGT OGC API platform** — *base URL + FeatureType pending-probe* | Open | `CONVERGENT-SECONDARY` — 2026-07-30 review; pending-probe | **CC BY 4.0** *(review — pending-probe)* | Living | Reviewer ★★★★★ "easiest win". Probe: FeatureType + DICOFRE attribute name. Confirm by direct probe before it gates production. |
| **CRUS (DGT)** — Classificação e Uso do Solo | territorial classification polygons — planning context | **DGT OGC API platform** — *collection name pending-probe* | Open | `CONVERGENT-SECONDARY` — 2026-07-30 review; pending-probe | **CC BY 4.0** *(review — pending-probe)* | Living | Reviewer ★★★★★. Probe: CRUS collection + classification attribute schema. Confirm by direct probe before it gates production. |
| **Orthophotos 30 cm (DGT)** — national imagery | 30 cm national orthoimagery base (== PNOA for ES) | **DGT OGC API platform** / tiled imagery — *pending-probe* | Open | `CONVERGENT-SECONDARY` — 2026-07-30 review; pending-probe | **CC BY 4.0** *(review — pending-probe)* | National | Reviewer ★★★★★. Confirm OGC API access + CC BY 4.0 by direct probe before it gates production. |
| **Copernicus DEM (~30 m)** — terrain fallback | GLO-30 terrain, fills the NW-mainland ~10% gap outside DGT LiDAR | Copernicus Data Space — GLO-30 tiles | Open | `CONVERGENT-SECONDARY` — 2026-07-30 review; pending-probe | Copernicus open licence | Global | **Terrain fallback, NOT a building-height source** — do NOT conflate. Confirm gap boundary by direct probe before it gates production. |
| **Lisbon CML — "Modelo Tridimensional"** | Council-wide 3D model, 1:1,000, LOD2/3-ish (balconies, setbacks, sidewalks, tunnel entries, walls >0.5 m) | `geodados-cml.hub.arcgis.com` | **LICENCE UNVERIFIED** | `COULD-NOT-VERIFY` (licence) | **MUST NOT redistribute until licence confirmed** | Phase 2 adds 1:5,000 tree clusters | Check redistribution licence before any integration. |
| **Lisbon CML — "Arvoredo"** | Per-tree dataset; legally-mandated municipal register (Regulamento Municipal do Arvoredo) | Lisboa Aberta / `dados.gov.pt` | CC-BY | `VERIFIED-LEAD` | CC-BY (Lisa-Aberta / dados.gov.pt terms) | Actively maintained | |
| **Infraestruturas de Portugal (IP)** | National road network | UNCONFIRMED | Open-data status **UNCONFIRMED** | `COULD-NOT-VERIFY` | UNVERIFIED | — | Do NOT use until licence and access confirmed. |

### A.3 — Braga PDM numeric values (CONVERGENT-SECONDARY; not primary-source verified)

| Field | Value | Unit | Governing instrument (approx) | Source | Confidence |
|---|---|---|---|---|---|
| Braga PDM — índice de utilização máximo (espaços residenciais) | 1.20 (0.80 above cota de soleira) | ratio | Braga PDM regulamento — specific article NOT confirmed | Research citation | `CONVERGENT-SECONDARY` — upgrade to `VERIFIED-PRIMARY` by reading Art. [X] of Braga PDM directly |
| Braga PDM — cércea máxima (espaços residenciais) | 7.5 m | m | Braga PDM regulamento — specific article NOT confirmed | Research citation | `CONVERGENT-SECONDARY` — upgrade by reading primary PDM text |
| Porto PDM — Art. 11 urban space categories | Two operative categories of urban space, delimited on Planta de Ordenamento by degree of urbanization | — | PDMP — Aviso n.º 12773/2021 (8 Jul 2021) | Research citation from Aviso n.º 12773/2021 | `CONVERGENT-SECONDARY` |
| Lisbon PDM — operative date | In force since revision published 30 Aug 2012, DR 2.ª série, n.º 168 | — | PDM Lisboa | Research citation | `CONVERGENT-SECONDARY` |

### A.4 — National labs & environmental providers (CONVERGENT-SECONDARY; 2026-07-30 review)

> Two similarly-named national labs are **distinct bodies** and must not be conflated.

| Source / layer | Body | Provides | Endpoint / locator | Access | Licence | Confidence |
|---|---|---|---|---|---|---|
| **LNEG** — geology | Laboratório Nacional de **Energia e Geologia** (energy + geology lab) | Geological mapping | LNEG geoportal — **modern OGC API** *(pending-probe)* | Open | *pending-probe* | `CONVERGENT-SECONDARY` — 2026-07-30 review; reviewer ★★★★★. Probe: LNEG OGC API base URL + one collection. |
| **LNEC** — civil engineering / geotech | Laboratório Nacional de **Engenharia Civil** | Civil-engineering / geotechnical data (distinct from LNEG) | LNEC — *pending-probe* | *pending-probe* | *pending-probe* | `CONVERGENT-SECONDARY` — listed to keep it **distinct from LNEG**; do NOT conflate. |
| **Environmental (REN / RAN / Natura 2000 / Protected / Flood)** | APA / LNEG / CCDR (scattered) | Environmental restriction layers | Multiple portals — **no single portal** | Open *(pending-probe)* | *pending-probe* | `CONVERGENT-SECONDARY` — reviewer ★★★★☆ "available but scattered". Each layer traces to a different provider. |

---

## B — UNVERIFIED / OPEN (stays `null` in the pack)

| Field | Why not verified | What would verify it (the exact source to read) |
|---|---|---|
| SNIT WFS field names and attribute schema | GetCapabilities + GetFeature not run | Run probe in `NEXT.md §3.2` — check whether "categoria de espaço", índice, cércea appear as structured WFS attributes or only as PDF reference links |
| SNIT WFS coverage completeness | Unknown — are all 308 PDMs queryable, or only a subset? | GetCapabilities → count FeatureTypes; GetFeature for 3 cities → verify zone polygon is returned |
| DGT LiDAR RMSE-Z (vertical accuracy) | DGT has published no formal RMSE-Z spec | Request from DGT; alternatively check the PRR project documentation at `fundoseuropeus.gov.pt` |
| DGT LiDAR class codes (integer mapping) | The 7 stated classes are named but integer codes are not confirmed vs ASPRS convention | Download one LAZ tile → run `lasinfo` or `pdal info --metadata` → record integer class values |
| DGT LiDAR ~90% coverage current state | Reported from founder deep-dive as "mid-2025 ~90%" but not independently verified | Check DGT CDD coverage map live; record NW gap boundary municipalities |
| Carta Cadastral OGC API status | Planned for 2025 but not confirmed live | Navigate `snig.dgterritorio.gov.pt` → check for OGC API endpoint for cadastral parcels |
| Lisbon CML 3D model redistribution licence | Licence at geodados-cml.hub.arcgis.com unread | Navigate hub URL → click dataset → read Terms of Use tab; if unclear, email CML data team |
| CGPR / SiNErGIC specific coverage per target city | The 127 CGPR + 7 SiNErGIC list is approximate; specific confirmation for Braga / Lisboa / Porto not done | Check DGT SNIC portal or SNIG coverage layer for Braga DICOFRE 0303, Lisboa 1106, Porto 1315 |
| Braga PDM regulamento governing article numbers | Article numbers for índice, cércea, afastamentos not confirmed | Read Braga PDM regulamento directly from SNIT PDF link |
| ~~Lisbon PDM "categorias de espaço" full list + numeric values~~ **CLOSED 2026-09-04** | **18 categorias enumerated from CML’s OWN Qualificação layer with its `ART_RPDM` zone→article map, and every envelope parameter extracted from the republicação integral.** ⚠ The finding is that there is largely NO index/cércea to source: Traçados A/B and A–C’s índice, and Actividades Económicas’ height, are ABSENT BY DESIGN — a measured absence, not an unsourced value. | → [`LISBOA-RPDML-PARAMETERS.md`](./LISBOA-RPDML-PARAMETERS.md) §6 carries the six remaining sub-gaps (Svp quadro cells, Anexos I–XII, `QUALIFICACAO.mpk` unpack, DRE alterações 2020→2026, `INFOPDM` contents, zone 7’s munícipio). |
| Porto PDM "índice de edificação" definition (what counts toward area) | Confirmed that Porto uses Art. 11 definition but exact formula text not read | Read PDMP Arts. 11–12 from SNIT/SNIG PDF; record the exact "área de edificação" definition |
| Moda da cércea — Porto PDMP governing article | Named mechanism confirmed; specific article number and formula text not read | Read Porto PDMP regulamento — search for "moda da cércea" term |
| Lisbon "créditos de construção" — Arts. 84/88/89 | Named and article numbers stated in research; full text not read | Read Lisbon incentives regulation Arts. 84/88/89; confirm the mechanism works as stated |
| Lisbon seismic-risk overlay — spatial extent | Mentioned in PDM environmental components; no spatial data sourced | Check Lisboa PDM cartografia de condicionantes for seismic-risk overlay layer |
| Any numeric value for any Portuguese parcel (index, cércea, setback) | No PDM regulamento has been read directly in this research pass | Read target PDM regulamento from SNIT link; add row per value to the relevant municipality SOURCES.md |
| Infraestruturas de Portugal road network — access terms | IP portal not visited | Navigate `infraestruturasdeportugal.pt` → data/open-data section; check licence terms |

---

> ⚠ No numeric índice, cércea, or afastamento value has been verified from a primary PDM source
> for any Portuguese parcel. The Braga figures (índice 1.20, cércea 7.5 m) are cited in research
> but their governing article has not been read directly. They may not be used in any pack at
> `confidence: structured` until the governing article is read and cited here.
