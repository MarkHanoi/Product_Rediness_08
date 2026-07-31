# Portugal — MASTER DATA-SOURCE & RULE-MECHANISM STUDY

> **Companion to the France, Germany and Belgium studies, same method.** Separate what is genuinely
> national from what a município does differently — and treat a different legal mechanism as a
> different engineering problem, not a parameter change.
>
> **Status:** RESEARCH COMPLETE + **LIVE-PROBED 2026-07-31**.
> **Sessions:** archival pass 2026-07-23 (no probes) · **live endpoint probe 2026-07-31 (this pass)**.
> **Evidence base:** [`PORTUGAL-DATA-RECON.md`](./PORTUGAL-DATA-RECON.md) — every URL + HTTP status.
> **Cross-refs:** [`../NEXT.md`](../NEXT.md) · [`../sources/SOURCES.md`](../sources/SOURCES.md) ·
> `de/findings/GERMANY-MASTER-DATA-SOURCE-STUDY.md` · `be/findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md`

---

## §0 — HOW TO READ THIS FILE

Every claim carries one of three states. **They are never collapsed.**

| | Meaning |
|---|---|
| **VERIFIED** | A live response was received and read this session, or a primary document was downloaded and its text extracted. |
| **ASSERTED-UNVERIFIED** | Stated by a prior pass, a portal description, or secondary research. **No primary read.** |
| **UNKNOWN** | Not investigated, or investigated inconclusively. **UNKNOWN ≠ zero and ≠ a permissive default** (L-616). |

The 2026-07-23 pass was entirely archival. **Where this pass contradicts it, this pass wins and
the correction is stated explicitly** — see §1.

---

## §1 — CORRECTIONS TO THE 2026-07-23 PASS (read this before anything else)

Five findings changed. Two are strategic reversals.

| # | Prior claim | Live-probe finding | Impact |
|---|---|---|---|
| **C1** | *"Portugal may not have a queryable national parcel-geometry source"* — the study's HEADLINE FINDING | **A national INSPIRE cadastral-parcel WFS is live, open, unauthenticated: `snicws.dgterritorio.gov.pt/geoserver/inspire/ows`, `inspire:cadastralparcel`, `numberMatched=1789404`.** `DescribeFeatureType` returns the full schema. **VERIFIED (I probed it myself).** | **The "no queryable source" framing is WRONG.** But see C2 — the conclusion it supported survives. |
| **C2** | *"Do NOT assume Lisbon/Porto city-centre coverage"* | **VERIFIED CORRECT, with numbers.** Porto municipality **0** parcels; Braga **0**; Lisboa **1,747** total and **0** in the Baixa historic core. Meanwhile Loulé 63,834 · Penafiel 23,906 · Tavira 11,015 · Algarve-wide 321,579. | **The warning was right.** The problem is **coverage**, not existence. |
| **C3** | TERRAIN axis = `blocked`, *"no open national bare-earth DTM published by DGT"* (`COUNTRY-RATE.md`) | **REFUTED.** `MDT10m2024_PTcontinente.zip` (3,545,398,706 B) downloads with **zero auth**. Bare-earth 50 cm/2 m/10 m products exist from the 2024–25 LiDAR; STAC catalogue + search fully open; **CC-BY 4.0**. Only the high-res *tile byte-fetch* sits behind a free self-service login. | **Terrain moves from Portugal's worst axis to one of its best.** |
| **C4** | SNIT endpoint = `snit-mais.dgterritorio.gov.pt`; resume step = probe its `/geoserver/wfs` | `snit-mais` returns **401** to anonymous clients. It is **not** a GeoServer; there is no anonymous WFS there. The real delivery host is **`servicos.dgterritorio.pt`**, per-plan WMS. | The prescribed resume step **cannot succeed as written**. |
| **C5** | Porto folder/row keyed `1315` | Porto's DICOFRE is **`1312`** — verified three ways (CAOP `dtmn`, SNIT service `…PDM1_1312_3027_3`, `IDDEPOSITO` `01.13.12/…`). | Repo defect; see §9. |
| **C6** | *(a correction to THIS pass's own first reading)* — "SNIT is WMS-only; the zoning boundary is a raster" | **False.** A second SNIT service family, **CRUS** (`SDISNITWFSCRUS_<DICOFRE>_1`), publishes **vector** zoning polygons nationally with `Classe`/`Categoria`, GeoJSON, EPSG:3763. Porto's municipal ArcGIS is also fully open. **VERIFIED.** | **Zoning geometry is a solved layer.** Only the numbers are missing. |

> **The net strategic effect is a swap, not a downgrade.** Portugal's *terrain* problem dissolved and
> its *parcel* problem sharpened into something precisely measurable. The 2026-07-23 instinct — that
> parcel geometry is Portugal's §34-equivalent gate — **survives contact with the data**. What changed
> is that we can now *measure* the gate instead of guessing at it.

---

## HEADLINE FINDING — the three-layer split

Portugal separates cleanly into three layers with **completely different** maturity. Conflating them
is how you get a wrong estimate.

| Layer | State | Evidence |
|---|---|---|
| **Terrain / elevation** | **Excellent.** National LiDAR 2024–25, 10 pts/m², 10 cm stated vertical accuracy, bare-earth MDT at 0.5/2/10 m, CC-BY 4.0, open STAC. A zero-auth 10 m national DTM. | VERIFIED |
| **Parcel geometry** | **Open, standards-clean, and largely EMPTY where it matters.** A textbook INSPIRE WFS serving 1.79 M parcels — with **0** in Porto, **0** in Braga, **0** in Lisboa's core. | VERIFIED |
| **Zoning GEOMETRY + category** | **Structured and national.** The **CRUS** WFS (`SDISNITWFSCRUS_<DICOFRE>_1`) serves vector zoning polygons with DR 15/2015 `Classe` + `Categoria`, GeoJSON, EPSG:3763. Porto's municipal ArcGIS is fully open. | VERIFIED |
| **Zoning NUMBERS (the envelope)** | **Absent from every structured source.** No índice, no cércea, no pisos, no afastamento in CRUS, in Porto's ArcGIS, or in Lisboa's viewer config. The PDM *plan images* are raster TIFFs. | VERIFIED |

> **Portugal's binding constraint is the NUMERIC layer — and that is the ordinary France/Germany
> problem, not an exotic one.**
>
> **I initially concluded something stronger and wrong, and it is worth recording why.** The SNIT
> plan services are all `Formato Matricial` — Lisboa's and Porto's PDMs really are georeferenced
> TIFFs — which tempts the conclusion *"even the zone boundary is a picture; there is no polygon to
> attach a number to."* **That is false.** A different SNIT service family, **CRUS**, publishes the
> same zoning as **vector polygons** nationally, and Porto's own ArcGIS serves `Qualificação do
> Solo` openly. **You never have to OCR a TIFF to get a zone boundary.**
>
> The honest statement is: **geometry and category are structured and national; the numbers are
> not.** And the redeeming counter-fact applies to the numbers — the regulamentos are **text PDFs,
> not scans** (VERIFIED: Porto's 100-page regulamento yielded 319,459 extractable characters). So
> Portugal's envelope problem is *rule-pack authoring from machine-readable law*, keyed by a
> category code you can already query. **That is a materially cheaper problem than the raster
> finding alone suggests** — and the two must always be reported together.

---

## PART A — THE NATIONAL COMMON BASELINE

### A.1 Parcels and cadastre — corrected, and now measured

**What exists (VERIFIED).** The **Sistema Nacional de Informação Cadastral (SNIC)**, run by **DGT**,
publishes a **live INSPIRE-conformant WFS 2.0**:

```
https://snicws.dgterritorio.gov.pt/geoserver/inspire/ows
  ?service=WFS&version=2.0.0&request=GetFeature&typeNames=inspire:cadastralparcel
```

- **GetCapabilities:** HTTP 200, 91,548 bytes
- **DescribeFeatureType:** HTTP 200 — **works** (unlike DGT's other GeoServer, §A.9)
- **`numberMatched`: 1,789,404**
- **CRS:** EPSG:3763 (ETRS89 / PT-TM06)
- **Auth: NONE**

**Schema (VERIFIED verbatim from `DescribeFeatureType`)** — canonical INSPIRE CadastralParcel:

| Element | Type | Card. |
|---|---|---|
| `inspireid` | `xsd:string` | **1..1 (mandatory)** |
| `geometry` | `gml:MultiSurfacePropertyType` | 0..1 |
| `referencepoint` | `gml:PointPropertyType` | 0..1 |
| `label` | `xsd:string` | 0..1 |
| `nationalcadastralreference` | `xsd:string` | 0..1 |
| `areavalue` | `xsd:double` | 0..1 |
| **`validfrom` / `validto`** | `xsd:dateTime` | 0..1 |
| **`beginlifespanversion` / `endlifespanversion`** | `xsd:dateTime` | 0..1 |
| `administrativeunit` | `xsd:string` | 0..1 |
| `id` | `xsd:int` | 1..1 |

> The brief asked me to look for INSPIRE `validFrom` / lifecycle fields. **They are here, on the
> cadastral theme** — `validfrom`, `validto`, `beginlifespanversion`, `endlifespanversion`. This is
> a proper temporal model. It is **not** on the planning side, because the planning side has no
> features at all (§A.2).

**Coverage — the load-bearing measurement (VERIFIED, this session):**

| Area | bbox parcels | Reading |
|---|---|---|
| **Porto municipality** | **0** | No cadastral coverage |
| **Braga municipality** | **0** | No cadastral coverage |
| **Lisboa municipality** | **1,747** | Marginal — and **0** in the Baixa core |
| Porto *district* (wide) | 66,973 | Surrounding municipalities covered |
| Braga *district* (wide) | 1 | Essentially nothing |
| North PT (very wide) | 164,906 | Sparse |
| **Algarve (wide)** | **321,579** | Dense |
| Loulé (SiNErGIC pilot) | 63,834 | Dense |
| Penafiel (SiNErGIC pilot) | 23,906 | Dense |
| Tavira (SiNErGIC pilot) | 11,015 | Dense |
| Belmonte | 0 | None |

**These zeros are real, not query artifacts.** The identical bbox construction returns 66,973 for the
Porto *district* and 321,579 for the Algarve — the mechanism works; the cities are empty.

> **The distribution exactly matches the historical CGPR pattern** (south of the Tagus + rural
> first) **plus the SiNErGIC pilots.** The three SiNErGIC municipalities I sampled all light up
> strongly. The 2026-07-23 pass's CGPR/SiNErGIC/no-cadastre model is therefore **corroborated by the
> spatial evidence**, even though its "no queryable source" headline was wrong.

**Still ASSERTED-UNVERIFIED:** the specific counts *127 CGPR / 7 SiNErGIC / 174 no-cadastre*. No
primary DGT document stating them was read. The spatial pattern is consistent with them; that is
corroboration, not verification.

**Legal status (ASSERTED-UNVERIFIED — carried from the archival pass, `dre.pt` text not re-read this
session):** DL 72/2023 (21 Nov 2023) unified CGPR and CPE/SiNErGIC into one *cadastro predial*, with
a single national identifier (NIP/NIC), and cadastral data constitute a **rebuttable presumption**
of location, geometry and area. Softer than France's PCI-Express or Germany's ALKIS. Carry as a
standing caveat.

**BUPi — handle with care (VERIFIED as an endpoint; ASSERTED as to authority).** `geo.bupi.gov.pt`
exposes an open ArcGIS query endpoint returning **3,471,456 polygons** (RGG). **This is nearly 2×
the authoritative cadastre and it is owner-declared, voluntary, non-authoritative.**
**Do NOT merge BUPi into one undifferentiated parcel layer.** If used at all, carry provenance
per-feature and never present it as cadastral truth.

**Authoritative-only cadastre beyond the open WFS** reportedly requires a **€50 SNIC professional
credential tied to Chave Móvel Digital** — a Portuguese digital identity. **ASSERTED-UNVERIFIED**
(reported by the parallel probe; not independently confirmed). If true this is the same
identity-bootstrap gate class as DK MitID / SE BankID, and is a hard blocker for a foreign SaaS.

---

### A.2 Zoning — genuinely national taxonomy, but the data is a picture

**National baseline (ASSERTED-UNVERIFIED this session; `VERIFIED-PRIMARY` in the archival pass from
`dre.pt`):** **RJIGT / DL 80/2015** establishes the IGT hierarchy (national → regional →
PDM/PU/PP), and **Art. 74(4)** requires dominant-use definitions and solo urbano/rústico categories
to obey **uniform criteria applicable to the whole national territory**, set by decreto
regulamentar — **DR 15/2015**.

**Post-2015 hard-code:** only **solo urbano** and **solo rústico** exist. *Solo urbanizável* was
abolished. An older PDM still referencing it needs amendment. **Write this as a constant in the PT
module.**

**Where Portugal snaps back to the France pattern:** DR 15/2015 sets the **category taxonomy but no
numeric ceiling** — no national maximum índice, no national maximum cércea. Contrast Germany's
§17 BauNVO, which does carry federal numeric bounds. **No cross-PDM numeric lookup table exists,
and no national sanity-check value exists.**

#### A.2.1 — How SNIT actually serves plans (VERIFIED — this is the critical finding)

The delivery host is **`servicos.dgterritorio.pt`** (not `snit-mais`, which is 401). Pattern:

```
https://servicos.dgterritorio.pt/SDISNITWMS<PLANTYPE>_<DICOFRE>_<IDIGT>_<VERSION>/wmservice.aspx
```

`<DICOFRE>` makes the URL space **enumerable by municipality** — a genuine asset.

**Every PDM opened declares `Formato Matricial` (raster):**

| City | DICOFRE | Service | Format |
|---|---|---|---|
| **Lisboa** | 1106 | `SDISNITWMSPDM1_1106_1815_2` | **Matricial** |
| **Porto** | 1312 | `SDISNITWMSPDM1_1312_3027_3` | **Matricial** |
| Belmonte | 0501 | `SDISNITWMSPDM1_0501_4144_2` | **Matricial** |
| Mogadouro (PP) | 0408 | `sdisnitWMSPP6_0408_2721_1` | **Matricial** |

Services advertise **only** `GetCapabilities`, `GetMap`, `GetFeatureInfo`. Software is
Hexagon/Intergraph, not GeoServer.

**GetFeatureInfo on the zoning layer returns raster-tile metadata, never zoning attributes.** The
same 11 attributes come back for all three PDMs — including `IMAGENAME` resolving to a **`.tif`**
(`PDM1312_932021_Or_1A.tif`), a `LEGENDLINK` to a **legend JPEG**, and the status trio below.

> **Consequence, stated plainly:** SNIT can tell you *which plan governs this point, whether it is in
> force, and its legal deposit reference*. It **cannot** tell you *the categoria de espaço here, or
> the índice and cércea that apply*. That lives in **coloured pixels**, decodable only against a
> **legend image**, with numbers in a **separate regulamento PDF**.

#### A.2.2 — Legal-status attributes: Portugal's answer to the Denmark question

The brief asked whether Portugal encodes binding-vs-indicative in metadata, as Denmark does with
`bygkunifelt` / `bygvejledende`.

| Field | Observed | State |
|---|---|---|
| **`IDESTADO`** | `2` on all three in-force PDMs | **VERIFIED present · semantics UNKNOWN** |
| **`VALIDADE`** / `IdValidade` | `1` on all three | **VERIFIED present · semantics UNKNOWN** |
| **`IDDEPOSITO`** | `01.13.12/PDM/03/2021/93` (Porto) · `03.11.06/PDM/02/2023/114` (Lisboa) — embeds DICOFRE | **VERIFIED present · grammar partly UNKNOWN** |

> **Verdict: Portugal DOES encode legal authority in published metadata — but at PLAN level, not
> ZONE level.**
>
> Denmark's flags say whether *this polygon's provision* binds. Portugal's say whether *this plan
> document* is in force. **Because the payload is a raster, there is no zone object for a flag to
> attach to.** Portugal cannot answer binding-vs-indicative per zone through metadata — not because
> it declined to, but because it publishes no zone objects here at all.
>
> `IDDEPOSITO` is nevertheless a real prize: it is an **evidence-chain anchor** tying a rendered
> pixel back to a registered legal instrument.
>
> **The codelists are the cheapest open item in the whole Portugal file.** `IDESTADO=2` /
> `VALIDADE=1` are *probably* "em vigor / válido" — **ASSERTED-UNVERIFIED**. One email to
> `snit.web@dgterritorio.pt` (published in every SNIT GetCapabilities) resolves both. **Do not
> hard-code `2` = in force until confirmed.**

#### A.2.3 — Layer naming: uniform prefix, per-municipal suffix

I initially read Belmonte's `1.1 / 1.2 / 2.x` numbering as a national standard. **Opening Lisboa and
Porto disproved it.**

- **Uniform (all 4 services):** the prefixes `Planta de Ordenamento -` and `Planta de Condicionantes -`, and a `Limite_do_IGT` layer.
- **NOT uniform:** the numbering (`1.1` vs `1` vs `1A`) and the zoning layer's own name —
  *Classificação e Qualificação do Solo* (Belmonte) / *Qualificação do Espaço Urbano* (Lisboa) /
  *Qualificação do Solo* (Porto).

**An adapter must resolve the zoning layer per municipality. It cannot hard-code the name.**

#### A.2.4 — CRUS: the national VECTOR zoning route (VERIFIED)

```
https://servicos.dgterritorio.pt/SDISNITWFSCRUS_<DICOFRE>_1/WFService.aspx
```

**CRUS = Carta do Regime de Uso do Solo** — a **separate SNIT service family** from the plan
rasters, and it is **vector WFS**.

| City | Result |
|---|---|
| Porto (1312) | **200** — `gmgml:CRUS_Porto_V`, 148.5 s |
| Lisboa (1106) | **200** — `gmgml:CRUS_Lisboa_V` |
| Braga (0303) | **502** after 200 s — **gateway error, not 404.** No conclusion. |

**CRS** `EPSG:3763` (+4326/3857/4258). **Outputs** GML 2.1.2/3.0/3.1.1/3.2, **GeoJSON**, CSV, KML, protobuf.

**Schema (VERIFIED):** `ID · DTCC · Municipio · Classe · Categoria · Area_Ha ·
Designacao_PlantaOrdenamento · Escala_PlantaOrdenamento · Data_PublicacaoPDM · Fonte · Autor ·
Geometry`.

Live Lisboa rows: `Classe=Solo Urbano`, `Categoria=Espaço Verde` /
`Espaço de Uso Especial Equipamentos e Infraestruturas`, `Escala 1/10000`,
`Data_PublicacaoPDM 2020-10-16`, `Fonte DGT`.

> **This is the national zoning-geometry route, and it maps directly onto DR 15/2015.** `Classe` is
> the solo urbano/rústico axis; `Categoria` is the qualification axis. **`Area_Ha` is polygon area,
> not a planning parameter.** There is **no índice, no cércea, no pisos** — the 11 fields are wholly
> categorical/administrative.
>
> **Engineering consequence:** the join key for a Portuguese rule pack is
> **`(DICOFRE, Classe, Categoria)` → numeric parameters read from that PDM's regulamento.** The
> geometry side is solved nationally; only the numeric side needs per-municipality authoring.

**⚠ `servicos.dgterritorio.pt` is severely slow** — 148 s GetCapabilities, 132–172 s for
`DescribeFeatureType`/`GetFeature`, one hard **502** at 204 s. **A 30 s timeout will read this
endpoint as dead when it is merely slow.** Long timeouts + retry are mandatory.

---

### A.3 The "no plan" fallback — Portugal's §34/RNU analogue

**ASSERTED-UNVERIFIED this session** (archival pass read `dre.pt`). Inside the **RJUE**
(DL 555/99, reformed by **DL 10/2024**):

- **licenciamento prévio** (full discretionary licensing) — reserved for higher-risk situations
  including **areas without precise urbanistic instruments**.
- **comunicação prévia** (lighter) — applies to *"áreas cujos parâmetros urbanísticos se encontrem
  efetivamente definidos"*.

**Portuguese law itself uses "does a numeric parameter exist for this land" as the switch between two
administrative procedures.** Where no PDM/PU/PP category with numeric parameters reaches a parcel,
there is no numeric ceiling to read.

Unlike France's RNU (a substitute nationwide *ruleset*), Portugal's condition triggers a
**procedure**, not a fallback rulebook.

**Engine implication:** the correct output for an RJUE "no-precise-parameters" parcel is a
**C58 §1.13 refusal with `code: 'legal'`** — never an estimate.

**No public estimate exists of what fraction of Portuguese urban land this covers. UNKNOWN.**

---

### A.4 Height, floor area, and the working vocabulary — now primary-sourced

**The terms are shared nationally; the numbers, the formulas, AND EVEN THE TERM ITSELF vary per PDM.**

That last clause is new and is **VERIFIED**. Three documents, three different FAR words:

| Municipality | FAR term | Floor-area term |
|---|---|---|
| **Porto** | **`índice de edificação`** | **`área de edificação` (ae)** |
| **Lisboa** | **`índice de edificabilidade`** | **`superfície de pavimento`** |
| Generic / other PDMs | `índice de utilização` | `área de construção` |

Measured in the Porto regulamento: `índice de edificação` **5** occurrences, `índice de utilização`
**0**, `altura da edificação` **0**, `cércea` **20**, `edificabilidade` **116**.

> **The two zeroes confirm from primary source what the archival pass could only assert:** Porto uses
> *índice de edificação* + *cércea*; Lisboa uses *índice de edificabilidade* + *altura da edificação*.
> **A pack cannot assume a term. It must read the PDM's own glossary article.**

**Cércea (VERIFIED — Porto Art. 3.º g):** *"a dimensão vertical da construção, medida a partir do
ponto de cota média do terreno marginal ao alinhamento da fachada até à linha superior do beirado,
platibanda ou guarda do terraço, incluindo andares recuados mas excluindo acessórios: chaminés, casa
de máquinas de ascensores, depósitos de água, etc."*

Note **"cota média do terreno marginal ao alinhamento da fachada"** — height is measured from the
**mean ground level at the façade alignment**, not at a block centroid. This is the *rasante*
problem already logged for Spain (`terrain-rasant-is-a-legal-defect`, L-584): **sampling one terrain
point per block is a legal defect in Portugal too.** Portugal's 50 cm LiDAR MDT makes doing it
correctly genuinely feasible.

**Área de edificação (VERIFIED — Porto Art. 3.º d):** the sum of each storey's area, **excluding**
uncovered terraces, non-glazed balconies, balconies open to the exterior, publicly-usable covered
open space, and attics without regulation headroom.

> This **closes a gap the archival pass flagged as open** — it stated Portugal has no national decree
> defining what counts toward área de edificação, so even the formula needs per-PDM sourcing. That
> remains true nationally. **Porto's formula is now sourced.**

**Moda da cércea (VERIFIED — Porto Art. 3.º o):** *"é a cércea que apresenta maior extensão ao longo
de uma frente urbana edificada"* — the cércea with the greatest extent along a built urban frontage.

**Engine implication (unchanged, now evidenced):** `moda da cércea` is its own `GeometricRule` kind —
**`fabricDerivedHeight`** — not a config value on an existing kind. It requires a C58 §2.2 amendment
analogous to the `blockDerivedAlignment` amendment made for Barcelona Art. 242. **The amendment must
precede any Porto pack.**

**Colmatação (VERIFIED in use):** infill within consolidated fabric. In Porto it *relaxes* other
rules — storey count becomes a function of the moda da cércea, and the H/2 setback is waived when
closing a party wall (*empena*).

---

### A.5 Setbacks (afastamentos) and RGEU

**National baseline (ASSERTED-UNVERIFIED this session):** the **RGEU** (1951, DL 38382, partially in
force) sets nationwide **habitability** minimums (light, room dimensions, ventilation). PDMs
reference it for *"condições mínimas de habitabilidade"*.

**RGEU does NOT set a nationwide height-proportional setback formula.** Setbacks are per-PDM.

**Porto's, now VERIFIED:** upper storeys must keep an `afastamento` to plot limits **≥ half their
height, minimum 3 m**, waived for *colmatação de empena*.

> **That is structurally the German BayBO Art. 6 form (0.4H, min 3 m) — arrived at independently and
> set municipally rather than federally.** Portugal's position: France-like in *where the rule
> lives*, Germany-like in *what the rule looks like*.

---

### A.6 LiDAR and elevation — Portugal's strongest layer (CORRECTED UPWARD)

**VERIFIED, from DGT's own published *Ficha Técnica* and live endpoints:**

| Property | Value |
|---|---|
| Campaign | **April 2024 – March 2025**, flown by DGT (PRR-funded) |
| Density | **10 pontos/m²** |
| **Planimetric accuracy** | **30 cm** |
| **Altimetric accuracy** | **10 cm** |
| CRS | PT-TM06 / ETRS89 + **Datum Altimétrico de Cascais** |
| Point cloud | LAS v1.4 R15, point format 8, tiled **1 km × 1 km** |
| Classification | 2 = Terreno · 3/4/5 = vegetation · **6 = Construções** · 9 = Água · 26 = Pontes |
| Derived rasters | MDT + MDS at **0.5 m, 2 m, 10 m** GeoTIFF (Float32, nodata −999) |
| **Licence** | **CC-BY 4.0** |

**Licence, verbatim from `dgterritorio.gov.pt/dados-abertos`:**
> *"A informação geográfica descarregada do Centro de Dados está sujeita a uma licença de utilização
> **CC-BY 4.0**, que permite a utilização livre e gratuita dos dados tendo apenas como obrigação a
> menção de que a entidade proprietária da informação é a Direção-Geral do Território."*

**Access tiers (VERIFIED):**

| Path | Auth | Note |
|---|---|---|
| **`MDT10m2024_PTcontinente.zip`** (3,545,398,706 B) | **NONE** | Whole-country bare-earth 10 m DTM, one download |
| STAC `cdd.dgterritorio.gov.pt/dgt-be/v1/collections` + `/search` | **NONE** | 13 collections; discovery and tile targeting fully open |
| `/dgt-be/v1/download/{sha256}` (0.5 m / 2 m / LAZ tiles) | **Keycloak login** | 302 → free self-service registration |
| `geo2…/geoserver` `MDT50m:MDT50m` | NONE | **WMS view only**; WFS *and* WCS both disabled |

**The registration gate, documented precisely (NOT attempted, per instruction):** realm
`dgterritorio`, client `aai-oidc-dgt`, PKCE S256. Self-registration is enabled. Mandatory fields:
`username`, `password` + confirm, `email`, `firstName`, `lastName`, `organizationname`, plus
dropdowns `affiliation` (incl. *empresa privada*, *cidadão*) and `interests` (incl. *Cartografia*,
*Cadastro*). **No CAPTCHA, no fee, no terms checkbox, no national-ID requirement.** A foreign private
company can self-register. **No account was created.**

> **On the internal note recording PT as needing "free account + secret":**
> **"free account" = CONFIRMED** (for high-res tiles only). **"secret" = REFUTED** — no key or secret
> is ever issued; auth is a Keycloak **session cookie** (`connect.sid`). DGT has **no public API**;
> the `/dgt-be/v1/*` STAC endpoints are undocumented internals — usable, but may change without
> notice.

**⚠ A licence discrepancy to carry honestly.** Every STAC collection carries
`"license":"proprietary"` and `"summaries":{"access":["private"]}`, contradicting the CC-BY 4.0
prose. The likely reading is that `access:private` encodes the *login gate* and `proprietary` is an
unset STAC default — **but that is inference, not verification.** The human-readable DGT page is the
authoritative licence statement. Also: `dgterritorio.gov.pt/Condicoes-de-utilizacao` (linked from
the CDD footer) contains **no licence terms at all**, only liability disclaimers — **do not cite it
as the licence.**

**Coverage gaps (VERIFIED):** all CDD collections are `location: ["continente"]` — **no Azores, no
Madeira**. DGT stated ~90 % downloadable as of 2025-06-25 with NW Portugal still in production;
**current completeness was NOT verified** and needs a STAC sweep.

**No RMSE is published.** DGT states *"exatidão"*, not RMSE. **Do not convert, and do not quote PNOA
parity** — Portugal has no Catastro-`ALTURAS` equivalent to cross-check building heights against.

**Heights bonus:** LAZ class **6 = Construções** means building heights are derivable as **MDS − MDT**
at 50 cm. The nDSM technique (`DSM − DTM`, 90th-percentile per footprint) is the **same shared
module** as Spain (L-511c) and France (L-512b) — **build once, feed PT tiles.** Do not one-off it.

**Building footprints (BGE, INE):** national vector footprints, 1:10,000, CC-BY-4.0.
**ASSERTED-UNVERIFIED**; height/storey attribute **NOT confirmed**. Take heights from nDSM, not BGE.

---

### A.7 Heritage and protective overlays

**ASSERTED-UNVERIFIED this session** (archival pass, `dre.pt`). Governed by **Lei 107/2001** +
**DL 309/2009**, administered by **DGPC**:

- **ZGP** — automatic **50 m** radius from a pending-classification asset.
- **ZEP** — required on classification; **variable** extent (not a fixed radius, unlike France's
  500 m ABF circle); published as a portaria; may include **ZNA** (*zona non aedificandi*).

**Structural advantage vs France:** the ZGP radius is fixed and predictable, and the ZEP reasoning is
explicit in its portaria. France's ABF is an opaque flat 500 m invisible in the base GPU query,
silently overstating buildability.

**DGPC Atlas do Património Classificado — NOT probed this session. Queryability UNKNOWN.**

Porto additionally carries a **UNESCO World Heritage** overlay (Ribeira/Barredo) and its PDM has
dedicated layers `1E Patrimonio_I` and `1F Patrimonio_II` (VERIFIED as layer names).

---

### A.8 Perequação — the equalisation machinery with no C58 analogue

**VERIFIED (article headings, Porto regulamento):**

- **Art. 131.º** Disposições base relativas à edificabilidade
- **Art. 132.º** Conceitos associados à edificabilidade
- **Art. 133.º** UT para efeitos de perequação da edificabilidade
- **Art. 134.º** **Edificabilidade média e edificabilidade abstrata**
- **Art. 135.º** **Edificabilidade concreta e compensações**

Plus 13 further `Artigo N.º — Edificabilidade` articles (20, 24, 27, 30, 32, 36, 38, 47, 51, 54, 91, 95).

**`edificabilidade média` / `abstrata` / `concreta`** is a land-value-equalisation system: the
abstract development right attaching to land versus the concrete one realised on it, with
compensation for the difference. **Article text NOT read — headings verified, mechanics UNKNOWN.**

This is the same conceptual family as Lisboa's *créditos de construção* (§B.1). **Neither has a C58
analogue.** A pack ignoring them will **understate** legally achievable floor area.

**No national "dwelling module" m²/unit figure exists** — same as France and Germany. Any such figure
is a project assumption and must be flagged as one.

---

### A.9 The WFS asymmetry — a deployment fact worth internalising

DGT runs **at least two GeoServers with opposite policies** (both VERIFIED):

| Host | WFS | WCS | Content |
|---|---|---|---|
| `geo2.dgterritorio.gov.pt/geoserver` | **DISABLED** (`Service WFS is disabled`) | **DISABLED** | CAOP, COS, CLC, altimetria, MDT50m, RGN — **no planning, no cadastre** |
| **`snicws.dgterritorio.gov.pt/geoserver/inspire`** | **ENABLED** | — | **Cadastral parcels** — `DescribeFeatureType` works |

> **Do not generalise from one DGT host to another.** A 155-layer keyword scan of `geo2` for
> `pdm · cadastr · parcel · ordenamento · condicionante · plano · igt · zon` returned **ZERO
> matches** — planning and cadastre are simply not on that server. Concluding "Portugal has no
> cadastral WFS" from `geo2` alone would have been wrong, and nearly was.
>
> On `geo2`, `GetFeatureInfo` with `INFO_FORMAT=application/json` is the working substitute — it
> returns full GeoJSON with geometry (verified against `caop_continente:cont_municipios`, which
> yields `dtmn`, `municipio`, `nuts1/2/3`, `area_ha`, `n_freguesias`).

---

## PART B — DEEP-DIVE PER MUNICÍPIO

### B.1 Lisboa (DICOFRE **1106**)

| Axis | State |
|---|---|
| **Cadastral** | **1,747 parcels municipality-wide; 0 in the Baixa historic core.** VERIFIED. Effectively unusable for the urban core. |
| **PDM on SNIT** | `SDISNITWMSPDM1_1106_1815_2`, **Formato Matricial** (raster). Zoning layer `Planta_de_Ordenamento_-_1_-_Qualificacao_do_Espaco_Urbano`. `IDDEPOSITO 03.11.06/PDM/02/2023/114` → 2023 deposit. VERIFIED. |
| **Regulamento (RPDML)** | **NOT retrieved this session.** Numeric parameter tables **UNKNOWN**. |
| **Vocabulary** | `índice de edificabilidade` · `superfície de pavimento` · `traçados urbanos` alongside `categorias de espaço`. VERIFIED. |
| **Zoning geometry** | **CRUS WFS `gmgml:CRUS_Lisboa_V` — OPEN**, GeoJSON, EPSG:3763, `Classe`/`Categoria`, CC-BY. VERIFIED. |
| **Municipal zoning service** | **`MuniSIG_Secure/WS_Planeamento_PDM2011_TESTE_FGC/MapServer` → ArcGIS error 499 `Token Required`.** AUTH WALL. The `MuniSIG_Secure` folder is not even listed anonymously. No token attempted. |
| **Municipal open data** | `dados.cm-lisboa.pt` CKAN: **0 PDM datasets** (control: 407 total — the portal works, it genuinely has none). AGOL org publishes only **PP/PU boundaries**, not zoning. `OpenDataLX` ArcGIS folder = `"services":[]`. |
| **Municipal field schema** | From the **public** viewer config: `OBJECTID · NOME · COD_SIG · INFOPDM · **ART_RPDM** · SE_ANNO_CAD_DATA · SHAPE…`. **`ART_RPDM` is a pointer to a Regulamento article, not a value.** A regex sweep for índice/cércea/altura/piso as *field names* across the 3.2 MB config found **none**. |
| **Municipal portal** | `geodados.cm-lisboa.pt` → **403 Cloudflare bot challenge** on one probe; **302 → 200** on a later probe the same day. **Both real; neither settled.** Do not record Lisboa as either bot-walled or open. No bypass attempted. |

**Créditos de construção — corrected (VERIFIED).** The instrument is a **separate municipal
regulation**, not PDM Arts. 84/88/89 as the archival pass recorded (**those article numbers were NOT
confirmed — treat as ASSERTED-UNVERIFIED**):

> *Regulamento Municipal que aprova o Sistema de Incentivos a Operações Urbanísticas com Interesse
> Municipal* — Deliberações **53/AM/2013** and **60/AM/2013** of 21 May, published in the
> **3.º Suplemento do Boletim Municipal n.º 1006, de 30 de maio de 2013**. `créditos de construção`
> occurs **132 times**.

**Mechanism (verbatim, abridged):** credits are used *"pelo acréscimo dos metros quadrados que
correspondem à superfície de pavimento determinada por aplicação dos índices previstos no RPDML, até
ao limite correspondente ao índice de edificabilidade máximo que possa resultar da utilização de tais
créditos, aplicável às diversas categorias de espaço e traçados urbanos definidos no RPDML"*.
Credits are represented by transferable **Títulos** and may be used across one or more operations.

> **⚠ The suspension — and a misreading I nearly committed.** Many pages carry a running header
> `*(Suspenso pela Deliberação 415/AML/2022 …, de 11 de agosto de 2022)`, which reads as *the whole
> regime is suspended*. **It is not.** The cover page states the scope precisely:
> *"**Alínea g) do n.º 1 do artigo 2.º e da alínea i) do n.º 2 do artigo 5.º suspensas** pela
> Deliberação 415/AML/2022"*.
>
> **VERIFIED: the suspension is PARTIAL — two alíneas, since 11 Aug 2022. The regime as a whole
> remains in force.** Recorded because anyone re-reading this document will hit the same trap.

**Engine implication:** Lisboa still needs a C58 **`transferableRights`** overlay before a pack can
be authored — **and that overlay must model the two suspended alíneas as not grantable.**

**Also open:** the seismic-risk overlay and the Carta Municipal de Património — **spatial extent
UNKNOWN**, neither sourced.

---

### B.2 Porto (DICOFRE **1312** — *not* 1315)

| Axis | State |
|---|---|
| **Cadastral** | **0 parcels.** VERIFIED — with the Porto *district* returning 66,973, so this is genuine absence, not a query artifact. |
| **PDM on SNIT** | `SDISNITWMSPDM1_1312_3027_3`, **Formato Matricial**. Zoning layer `Planta_de_Ordenamento_-_1A_-_Qualificacao_do_Solo`. `IDDEPOSITO 01.13.12/PDM/03/2021/93`. VERIFIED. |
| **Regulamento** | **RETRIEVED AND FULLY EXTRACTED** — `pdm.cm-porto.pt/documents/121/Regulamento_PDMPorto.pdf`, 100 pages, **text PDF**, 319,459 chars. VERIFIED. |
| **Zoning geometry (national)** | **CRUS WFS `gmgml:CRUS_Porto_V` — OPEN**, GeoJSON, EPSG:3763. VERIFIED. |
| **Municipal GIS** | **WIDE OPEN.** `fedservergeo.cm-porto.pt/arcgis/rest/services` — **ArcGIS Server 11.5, anonymous**, 23 folders incl. `PDM2021` (18 services). `PO1A_QS/MapServer/8` = *Qualificação do solo funcional*, 36 fields (`c_espaco`, `sc_espaco`, `designacao_po`…), queryable, EPSG:3763. **Zero numeric planning fields.** |
| **Municipal WMS** | `geopdm.cm-porto.pt` GeoServer WMS 1.3.0 — **361 layers**, 142 queryable, `<Fees>none</Fees>`, `<AccessConstraints>none</AccessConstraints>`. Its companion WFS returns an **EMPTY `<FeatureTypeList>`** (valid-but-empty: advertised, publishes nothing). |
| **Municipal open data** | `opendata.porto.digital` CKAN — **21 PDM datasets**, mostly **CC-Zero**. |

**Porto is the only Portuguese city whose numeric envelope rules are now primary-sourced, AND the
only one whose zoning polygons are obtainable from two independent open routes (CRUS + municipal
ArcGIS).**

**The one machine-readable numeric — and why it must not be wired as a FAR (VERIFIED).**
`cc_czp.gpkg` (*Carta de Zonamento Perequativo*, CC-Zero, 136 MB), table `CC_UTPEREQUATIVAS_PL`:

| designacao | **edificab_m** |
|---|---|
| Área Central | **1.18** |
| Área Ocidental e Arco Exterior | **0.67** |
| Área Oriental | **0.25** |

> `edificab_m` is an **edificabilidade média** and the table has **exactly 3 rows** — three city-wide
> perequação macro-zones. It is the **equity/compensation reference index of §A.8**, not a
> per-parcel or per-zone binding envelope. **Wiring it as a FAR would produce a confidently wrong
> envelope across all of Porto** — precisely the L-616 failure mode. The binding numbers are the
> Art. 32/36/38 values below.

#### Numeric rules (VERIFIED)

| Article | Rule |
|---|---|
| **Art. 32.º** | New buildings: área de edificação ≤ that from an `índice de edificação` of **1**. Existing below 1 may extend **to 1**, if `índice de impermeabilização ≤ 0,6`. |
| **Art. 36.º** | Áreas de Atividades Económicas **Tipo I** — IE máximo **1,8**; impermeable ≤ **70 %** |
| **Art. 38.º** | Áreas de Atividades Económicas **Tipo II** — IE máximo **1,4**; impermeable ≤ **70 %** |
| Espaços Centrais | **Cércea ≤ width of the confronting arruamento** |
| Espaços Centrais | Where the public-space cross-section **> 21 m** → **cércea máxima 21 m**, *unless the moda da cércea is higher, in which case the moda prevails* |
| Espaços Centrais | Local widenings ignored — cércea is that of the rest of the frontage |
| | **Profundidade ≤ 25 m** from the alinhamento (a second subcategory: **30 m**), and `índice de impermeabilização ≤ 0,7` |
| | **Afastamento ≥ H/2, min 3 m** for upper storeys; waived for colmatação de empena |
| | Max **3 storeys** in the stated subcategory; in *colmatação* storeys = f(moda da cércea) |
| | Logradouros permeable, `índice de permeabilidade ≥ 0,3`; ancillary ≤ **10 m²** |
| | Parcels **> 2000 m²** exempt from the frontage-implantation constraint |
| | Pitched roofs ≤ **30°** |

> **The `cércea ≤ street width, capped 21 m, overridden by moda da cércea` rule is Barcelona's
> `amplada de vial` table in Portuguese** — with a fabric-derived override bolted on. Porto is
> simultaneously the *most transferable* Spanish-genome city (§C) and the one needing a **new C58
> rule kind**.

**Blockers before a Porto pack:** (1) C58 `fabricDerivedHeight` kind for moda da cércea;
(2) **zero cadastral parcels** — no *parcel* geometry to apply rules to. **Zoning geometry is NOT a
blocker** (CRUS + municipal ArcGIS both open); the raster PDM is a presentation artefact, not the
only source.

---

### B.3 Braga (DICOFRE 0303)

| Axis | State |
|---|---|
| **Cadastral** | **0 parcels** (district-wide: **1**). VERIFIED. |
| **SNIT PDM service** | `AnyText like '%SDISNITWMSPDM1_0303%'` → **0 records**. **This is a valid-but-empty search about a URL pattern — NOT evidence Braga lacks a PDM.** Braga's PDM is in force per the archival pass. |
| **Numeric values** | índice 1.20 (0.80 above cota de soleira), cércea 7.5 m for *espaços residenciais* — **ASSERTED-UNVERIFIED**, governing article never read. |

> **The archival pass named Braga "the most tractable first target". That recommendation does not
> survive this pass.** Braga has zero cadastral parcels, no locatable SNIT service under the standard
> pattern, and its only two numbers remain unverified. **It should be demoted.** (§D)

---

### B.4 Cross-city comparison (all cells VERIFIED unless marked)

| | Lisboa (1106) | Porto (1312) | Braga (0303) |
|---|---|---|---|
| Cadastral parcels (municipality) | **1,747** (0 in core) | **0** | **0** |
| Zoning geometry — CRUS WFS | **✓ open** | **✓ open** | **502** (no conclusion) |
| Zoning geometry — municipal | **✗ 499 Token Required** | **✓ open ArcGIS 11.5 + 361-layer WMS + 21 CC-Zero datasets** | not probed |
| PDM plan images on SNIT | raster | raster | service not located |
| Regulamento retrieved | ✗ | **✓ text PDF, fully extracted** | ✗ |
| Numeric rules sourced | ✗ | **✓ (Art. 32/36/38 + height/depth/setback)** | ASSERTED only |
| FAR term | `índice de edificabilidade` | `índice de edificação` | UNKNOWN |
| Floor-area term | `superfície de pavimento` | `área de edificação` | UNKNOWN |
| New C58 kind needed | `transferableRights` | `fabricDerivedHeight` | none identified |
| Municipal open data | CKAN **0** PDM datasets (of 407) | CKAN **21** PDM datasets | not probed |

---

## PART C — GENOME TRANSFER: DOES THE SPANISH VOCABULARY CROSS THE LANGUAGE BOUNDARY?

**The question:** the Spanish planning-compiler thesis holds that a small set of primitives
(FAR · coverage · height · setback · depth · alignment) recurs across instruments with different
names. Portugal is the first test of whether that survives a **language** boundary, not just a
municipal one.

> **⚠ Source-availability caveat.** The three founder genome documents named in my brief
> (`SOURCE-founder-spanish-planning-genome-*`, `SOURCE-founder-spain-national-planning-compiler-*`,
> `SOURCE-founder-spain-compiler-hypotheses-H1-H4-*`) **are not present in this worktree** — the only
> file under `es/findings/` is `SPAIN-CONTEXT-DATA-DEEP-DIVE-L512.md`. I could not read the canonical
> primitive list or taxonomy. **The mapping below is therefore anchored on the Portuguese side
> (which I read directly) and on Barcelona mechanisms already documented in repo memory
> (`amplada de vial`, `edificabilitat`, Art. 242), not on the founder's canonical primitive names.**
> The ES-side column should be re-checked against those documents when available.

### C.1 The term table

**VERIFIED** = read from a live schema/service response or extracted from a primary ordinance this
session. **ASSERTED** = plausible and conventional, but not read by me.

| Canonical concept | Portuguese term(s) | Spanish/Catalan analogue | Evidence | State |
|---|---|---|---|---|
| **FAR / floor-area ratio** | **`índice de edificação`** (Porto) · **`índice de edificabilidade`** (Lisboa) · `índice de utilização` (generic) | `edificabilitat` / `índice de edificabilidad` | Porto Art. 3.º m, verbatim; Lisboa incentives reg. | **VERIFIED** (Porto, Lisboa) · ASSERTED (generic) |
| **Gross floor area** | **`área de edificação` (ae)** (Porto) · **`superfície de pavimento`** (Lisboa) | `sostre` / `superficie construida` | Porto Art. 3.º d, verbatim exclusion list | **VERIFIED** |
| **Buildability (umbrella)** | **`edificabilidade`** (116 occurrences; own article series 131–135) | `edificabilitat` | Porto regulamento | **VERIFIED** |
| **Height to eave/parapet** | **`cércea`** | `alçada reguladora màxima` (ARM) | Porto Art. 3.º g, verbatim | **VERIFIED** |
| **Height (alt. definition)** | **`altura da edificação`** (Lisboa; **0 occurrences in Porto**) | `alçada` | Absence in Porto measured; Lisboa usage from secondary | **VERIFIED (as Porto-absent)** · ASSERTED (Lisboa definition) |
| **Fabric-derived height** | **`moda da cércea`** | Barcelona Art. 242 block-derived alignment/height | Porto Art. 3.º o, verbatim + operative rules | **VERIFIED** |
| **Street-width-driven height** | **`cércea ≤ largura do arruamento`**, cap **21 m** | **`amplada de vial`** table | Porto, Espaços Centrais | **VERIFIED** |
| **Setback from boundary** | **`afastamento`** (≥ H/2, min 3 m) | `separació a llindars` / `retranqueo` | Porto, verbatim rule | **VERIFIED** |
| **Buildable depth** | **`profundidade`** (≤ 25 m / 30 m from alignment) | **`profunditat edificable`** | Porto, verbatim rule | **VERIFIED** |
| **Alignment** | **`alinhamento`** (29 occurrences); `alinhamento de tardoz` = rear | `alineació de vial` | Porto regulamento | **VERIFIED** |
| **Urban frontage / block face** | **`frente urbana`** | `front de illa` | Porto Art. 3.º l, verbatim | **VERIFIED** |
| **Infill on consolidated fabric** | **`colmatação`** (+ `empena` = party wall) | Barcelona clau-12 fabric-derived fallback | Porto, operative rules | **VERIFIED** |
| **Plot / parcel** | **`parcela`** · `prédio` (legal) | `parcel·la` / `parcela` | Porto Art. 3.º p, verbatim | **VERIFIED** |
| **Rear yard / block interior** | **`logradouro`** | `pati d'illa` | Porto, permeability rule | **VERIFIED** |
| **Coverage / imperviousness** | **`índice de impermeabilização`** · `índice de permeabilidade` | `ocupació` (related but not identical) | Porto, values 0,6 / 0,7 / 0,3 | **VERIFIED** (PT side) · ASSERTED (equivalence) |
| **Ground coverage** | `ocupação` (19 occurrences) | **`ocupació`** | Porto term present; defining article not read | **ASSERTED** |
| **Land classification** | **`solo urbano` / `solo rústico`**; `qualificação do solo` | `sòl urbà` / `sòl no urbanitzable` | Porto layer names + regulamento; DR 15/2015 | **VERIFIED** (terms) · ASSERTED (DR 15/2015 text) |
| **Zoning category** | **`categoria de espaço`** · `traçados urbanos` (Lisboa) | `clau` / `calificación` | Porto Art. 3.º m; Lisboa incentives reg. | **VERIFIED** |
| **Constraints / servitudes** | **`condicionantes`** · `servidões administrativas e restrições de utilidade pública` | `afectacions` / `servidumbres` | SNIT layer names, all 4 services | **VERIFIED** |
| **Equalisation** | **`perequação`**; `edificabilidade média/abstrata/concreta` | `repartiment de càrregues i beneficis` | Porto Arts. 131–135 headings | **VERIFIED** (headings) · UNKNOWN (mechanics) |
| **Transferable dev. rights** | **`créditos de construção`** (Lisboa) | *no Barcelona analogue documented* | Lisboa incentives reg., 132 occurrences | **VERIFIED** |

### C.2 Verdict

> **The genome transfers — and it transfers more strongly than a language boundary would predict.**

**What transfers cleanly (VERIFIED).** Every core primitive has a Portuguese term with a *directly
comparable operative structure*, not merely a cognate:

- FAR is a ratio of counted floor area to plot area, with an **explicit exclusion list** — same shape as Spain.
- Height is measured to eave/parapet **from mean ground at the façade alignment**, excluding lift rooms, tanks and chimneys — the same construction as `alçada reguladora`.
- **`cércea ≤ street width`, capped at 21 m, is `amplada de vial` in Portuguese.** This is the single
  strongest transfer signal in the study: an independently-drafted Romance-language ordinance
  reaching for the same street-width-drives-height primitive.
- **`profundidade ≤ 25 m`** is `profunditat edificable`.
- **`moda da cércea`** is a fabric-derived height rule of exactly the kind Barcelona Art. 242 forced
  into C58 as `blockDerivedAlignment`.

**What does NOT transfer — and this is the load-bearing caveat.**

1. **The term itself is not stable *within* Portugal.** Three documents gave three FAR words and two
   floor-area words. Spain's variance is across regions; **Portugal's is across neighbouring
   municipalities**, and it is measurable: `índice de utilização` occurs **0** times in Porto.
   *A compiler cannot key on the term. It must key on the **definition**, read from the PDM's own
   glossary article.*
2. **Portugal adds two primitives Spain does not have documented here** — `perequação`
   (edificabilidade média/abstrata/concreta) and `créditos de construção`. Both **redistribute or
   transfer** development rights. A compiler modelling only *ceilings* will **understate** Portuguese
   capacity. Neither has a C58 analogue.
3. **The discovery engine transfers HALFWAY — and the split is clean.** Spain's compiler assumes you
   can *find the zone* and *read its attributes*. In Portugal you **can** find the zone — CRUS gives
   national vector polygons with `Classe`/`Categoria` — but the attributes **stop at the category
   code**. Every Portuguese structured source checked (CRUS's 11 fields, Porto's 36 ArcGIS fields,
   Lisboa's 9 viewer fields) is **wholly categorical**. Lisboa's schema is almost poignant about it:
   the field is **`ART_RPDM`** — *a pointer to a Regulamento article*, exactly where the number
   isn't.

**Practical conclusion.** Port the **rule kinds and the semantic layer** — high confidence, immediate
reuse. Port the **zone-discovery step** too, with CRUS substituted for the Spanish WFS. Do **not**
expect the attribute-read step to survive: in Portugal that step is replaced by a
**`(DICOFRE, Classe, Categoria)` → regulamento-PDF** rule-pack lookup.

---

## PART D — SCALE, TARGETS, AND PROJECT SHAPE

### D.1 The tier model, re-cut on measured evidence

The archival pass gated on *"does a queryable parcel exist"*. That question is now **answered — yes,
nationally — and replaced by a sharper one: does it contain anything here?**

| Tier | Definition | Occupants (measured) |
|---|---|---|
| **Tier 1** | Cadastral parcels present **and** dense | **Loulé (63,834) · Penafiel (23,906) · Tavira (11,015)** — all SiNErGIC pilots; Algarve broadly (321,579) |
| **Tier 2** | Rules sourceable, parcels absent | **Porto** — full numeric rule set VERIFIED, **0 parcels** |
| **Tier 3** | Neither sourced | **Lisboa** (1,747 parcels, none in core; RPDML not retrieved), **Braga** (0 parcels, service not located) |

> **The uncomfortable, honest shape of Portugal: the cities with the commercial weight have the
> worst data, and the municipalities with the best data have little commercial weight.**

### D.2 Recommended target municipalities

The brief asked for 1–3 targets *"Lisboa, Porto, and one more"*. **The evidence does not support that
ordering, and I am not going to endorse it as asked.**

**1 — Porto (1312) — the clear first target.**
The strongest city in the country on every axis except parcels: a fully extracted **text
regulamento** with VERIFIED numeric rules (IE 1 / 1,8 / 1,4; cércea ≤ street width cap 21 m;
profundidade 25/30 m; afastamento H/2 min 3 m), **zoning polygons from two independent open routes**
(CRUS WFS + anonymous ArcGIS Server 11.5), a 361-layer municipal WMS with `Fees: none`, and 21
CC-Zero CKAN datasets. Commercially heavy; strongest Spanish-genome transfer in the study.
**Blockers:** 0 cadastral parcels; needs the C58 `fabricDerivedHeight` amendment. Best use:
**prove the whole rule-authoring path end-to-end**, with parcels supplied by draw-flow rather than a
provider.

**2 — Loulé (Algarve, SiNErGIC pilot) — best first target, on data.**
**63,834 cadastral parcels** — the densest sampled. Modern SiNErGIC cadastre = highest geometry
confidence in the country. High-value Algarve development market (tourism/resort/second homes),
which is real commercial weight even if it is not Lisbon. **Blockers:** PDM not examined; rules
entirely UNKNOWN.

> **Running Porto and Loulé together de-risks Portugal properly**, because they fail in opposite
> directions: Porto has rules without geometry, Loulé has geometry without rules. A pipeline that
> satisfies both is a genuinely national pipeline.

**3 — Lisboa (1106) — necessary, not first.**
Unavoidable commercially, but it is the *hardest* target: near-zero usable cadastre, raster zoning,
RPDML unread, a bot-walled municipal portal, **and** the only city needing a `transferableRights`
overlay with a partially-suspended credit regime. **Sequence it third**, after the pipeline works.

**Explicitly demoted: Braga.** The archival pass called it "the most tractable first target". On
measured evidence — **0 cadastral parcels, district-wide 1, no locatable SNIT service, two
unverified numbers** — that recommendation should be withdrawn.

### D.3 Sequencing principles

1. **Stop gating on "does a parcel exist" — it does. Gate on parcel COUNT per candidate municipality.**
   The bbox-hits query in §A.1 is cheap, decisive, and should be run before any city is scoped.
2. **Do NOT budget for raster ingestion as the primary path.** CRUS gives national vector zoning
   polygons with `Classe`/`Categoria`. The join key for a pack is
   **`(DICOFRE, Classe, Categoria)` → numbers from that PDM's regulamento.** The raster PDM plates
   are a presentation artefact and a fallback, not the route.
3. **Regulamentos are text PDFs — extraction, not OCR.** Combined with (2), Portugal's envelope cost
   is ordinary rule-pack authoring, not a novel pipeline. Always report (2) and (3) together.
4. **Terrain is a solved advantage.** 50 cm bare-earth + 10 cm accuracy + CC-BY 4.0 makes Portugal one
   of the best-provisioned jurisdictions for the *rasante-at-façade* measurement its own law requires.
   Build the nDSM module once (ES + FR + PT).
5. **Never merge BUPi with SNIC.** 3.47 M owner-declared polygons vs 1.79 M authoritative. Provenance
   per feature, always.

---

## PART E — WHAT REMAINS GATED, MISSING, OR UNVERIFIED

**Gated (documented, not attempted — no account created, no bot protection circumvented):**

| Gate | Nature |
|---|---|
| DGT CDD high-res tiles | Free Keycloak self-registration; no key/secret issued |
| `snit-mais.dgterritorio.gov.pt` | IIS 401 on app root + `/api` (static image paths remain public) |
| `geo2…/geoserver/rest` · `/web` | 401 / 403 admin surfaces |
| `geodados.cm-lisboa.pt` | Cloudflare bot challenge — a challenge, **not** an absence |
| Authoritative cadastre beyond the open WFS | Reported €50 SNIC credential + Chave Móvel Digital — **ASSERTED-UNVERIFIED** |

**Highest-value open questions:**

| # | Question | Cost |
|---|---|---|
| 1 | **`IDESTADO` / `VALIDADE` codelists** and `IDDEPOSITO` grammar | One email to `snit.web@dgterritorio.pt` |
| 2 | **Does ANY município publish vector PDM zoning with numeric attributes?** | Municipal ArcGIS/WFS sweep — if yes, it reorders every target |
| 3 | Lisboa **RPDML** regulamento — retrieve + extract | One download |
| 4 | **Loulé PDM** — rules for the best-cadastre municipality | One download |
| 5 | Current LiDAR completeness (the NW gap) | STAC sweep |
| 6 | Full SNIT `<PLANTYPE>` list; enumerate services by DICOFRE | Catalogue paging → true national census |
| 7 | DGPC heritage Atlas queryability | GetCapabilities probe |
| 8 | Perequação mechanics (Porto Arts. 131–135 text) | Read 5 articles already in hand |

**Could not verify this session:** the DR 15/2015 / RJIGT / RJUE / RGEU / DL 72/2023 primary texts
(carried from the archival pass as ASSERTED); the CGPR 127 / SiNErGIC 7 / no-cadastre 174 counts;
Lisboa PDM Arts. 84/88/89; Braga's two numeric values; BGE height attributes; DGPC layer
queryability; any Azores/Madeira coverage.

---

*Live-probe session 2026-07-31. Every HTTP status and count in this file was observed, not inferred.
Catalogue hit-counts carry ~83 % measured precision (see `PORTUGAL-DATA-RECON.md` §3.2) and are upper
bounds, never exact totals. Where this file says UNKNOWN, nobody has looked — it does not mean zero,
and it does not license a permissive default (L-616).*
