# LANE 1 — THE FLOOR-LEVEL CHANNELS (brief Q1 · Q2 · Q3)

> Lane `L1` of the SPAIN CATASTRO 3D AS-IS investigation · brief `../ES-CATASTRO-3D-BRIEF.md`.
> Companion to `es-catastro-3d-investigation.md` §P1–P6 (predecessor, banked) and §L2 (spec-derived).
> **This lane is LIVE-PROBE ONLY**: every row below is a request I made and a response I read.
> Written to a sibling file because L2 was actively appending to the shared log (collision rule).
> Raw artefacts in session scratchpad `es3d-l1/`. Sample subjects: **ES-A `2940601DF3824B`**
> (Barcelona, del=8 mun=900) · **ES-B `2255404VK4725E`** (Madrid, C/ Castelló 47, del=28 mun=900),
> plus 9 neighbours obtained from the parcels' own `colindantes` products and 6 city-centre parcels
> obtained via `Consulta_RCCOOR`.
> Licence/rate facts are CITED from P2 and P5, not re-read.
> **Probe budget: 85 live requests, 2026-09-01 14:27–14:53 UTC.** No viewer was scraped.

---

## L1-0 · ⭐ THE ENDPOINT MAP — discovered, not guessed

The SEC guide (P5 §3.1.3) names six per-parcel products but **publishes no URL for any of them.**
They are `__doPostBack` targets on an ASP.NET WebForm — `OVCListaBienes.aspx` — all rendered
`style="display:none"`. I recovered the real endpoints by replaying each postback with its
`__VIEWSTATE`/`__EVENTVALIDATION` and reading the redirect target.

Host page (HTTP 200, 616,868 B, 14:33 UTC):
`https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCListaBienes.aspx?del=08&mun=900&rc1=2940601&rc2=DF3824B`
Controls: `btnFXCCGeneral` "FXCC de planta general" · `btnFXCCColindantes` "FXCC con colindantes" ·
`btnFXCCDes` "FXCC por plantas" · `btnPDFFXCC` "PDF de FXCC" · `btnVerFXCC` "Descargar KML" ·
`btnFXCCVer` "Descargar KML de planta". The page's own `PonRefCat(del,mun,rc,idControl)` sets
`hdDelegacion`/`hdMunicipio`/`hdRC` then posts back.

| # | Product | Endpoint (measured) | Gate |
|---|---|---|---|
| a | FXCC planta general | `www1.sedecatastro.gob.es/Cartografia/`**`GeneraFXCU1.aspx`**`?refcat=&del=&mun=&captcha=<40hex>` | **captcha token** |
| a′ | FXCC + colindantes | same `+ &colindantes=Y` | **captcha token** |
| b | **FXCC por plantas** | `www1.sedecatastro.gob.es/Cartografia/FXCC/`**`DescargaFXCC.aspx`**`?refcat=&del=&mun=&captcha=<40hex>` | **captcha token** |
| b′ | PDF de FXCC | `www1.sedecatastro.gob.es/Cartografia/FXCC/`**`ImprimirPDFFXCC.aspx`**`?…&captcha=<40hex>` | **captcha token** |
| c | Parcel KML | `ovc.catastro.meh.es/Cartografia/WMS/`**`BuscarParcelaGoogle3D.aspx`**`?refcat=&del=&mun=&tipo=3d` | **none** (needs a browser UA) |
| d | **KML por plantas** | `www1.sedecatastro.gob.es/Cartografia/FXCC/`**`FXCC_KML.aspx`**`?refcat=&del=&mun=` | ⭐ **NONE** |
| — | Facade photo | `…/Cartografia/FXCC/FotoFachada.aspx?…&captcha=<40hex>` | captcha (but P6's `OVCFotoFachada.svc` GET is keyless) |

**No documented API exists for any of them.** P5 §3.2's documented service family is the SOAP/`.svc`
set; FXCC and KML are not in it. These are WebForm download handlers, undocumented, unversioned,
with no published contract — the DGC may change them unilaterally (P5 licence, formats clause).

### ⭐⭐ THE CORRECTION THIS LANE OWES §L2-6

§L2-6 Path 3 states: *"the floor-level ATTRIBUTES are a Class-A national service. **Only the
floor-level GEOMETRY is Class-B/CAPTCHA-gated.**"* **The second half is FALSE as measured.**
The CAPTCHA gate covers the **FXCC (DXF/ZIP) delivery** of the floor geometry. The **same floor
geometry is served un-gated as KML** by `FXCC_KML.aspx` — no captcha, no cookie, no session, no
referer, no UA spoof. Measured cold at 14:38 UTC:
`curl "https://www1.sedecatastro.gob.es/Cartografia/FXCC/FXCC_KML.aspx?refcat=2255404VK4725E&del=28&mun=900"`
→ **HTTP 200 · 177,075 B · `application/vnd.google-earth.kml+xml`**.
This does **not** make it licence-clear at scale (see L1-6); it makes the *technical* gate absent
where L2 recorded one present.

---

## L1-1 · (a) FXCC PLANTA GENERAL — what a real file contains · **2D, no Z**

`GeneraFXCU1.aspx`, ES-A, 14:34 UTC → **ZIP 2,200 B** = `2940601DF3824B/{.dxf 13,764 B, .asc 157 B}`.

**DXF census (measured, not read):** 36 TEXT · 30 LINE · 21 POLYLINE · 83 VERTEX.
Layers `PG-LP` (perímetro parcela) · `PG-LI` (líneas interiores / recintos) · `PG-AA` · `PG-AS`.

- `PG-AA` 18 TEXT = the **roman-numeral volumetría**: `-I`, `-I+VI`, `-I+I`, plus nature codes `P`, `ESC`.
- `PG-AS` 18 TEXT = **m² per recinto**: 786, 979, 307, 1142, 778, 216, 50, 24, 33, …
- ⛔ **ZERO DXF group-code 30 or 38 anywhere. The FXCC is strictly planimetric.** All "3D" in the
  Catastro products is synthesised downstream from the roman numeral. This is P4 read as a spec;
  here it is **measured on the file**.

**`.asc`** = fixed-width alphanumeric: `080 / BARCELONA / 900 / BARCELONA / 02908 / … / 2940601 /
DF3824B / DR / IZ / FD`.

**Freshness — ⭐ planta general is generated LIVE.** ZIP entry mtime = **2026-09-01 16:35 local**
(the moment I requested it); the colindantes `.asc` carries date field `01/09/26`. Contrast L1-2.

**CRS — ⛔ a real trap.** The DXF declares **no coordinate system at all** (no HEADER section).
Measured extents: ES-A `X 432,826.59–432,902.56 · Y 4,583,788.02–4,583,898.24` → **UTM 31N
(EPSG:25831)**; ES-B `X 442,132.61–442,196.92 · Y 4,475,365.34–4,475,381.65` → **UTM 30N
(EPSG:25830)**. The huso must be inferred from the province. Reading a Barcelona FXCC as 25830
displaces it ~400 km with no error raised.

**Bulk equivalent — YES.** `manual_descriptivo_shapefile.pdf` (v2.0, 27-06-2014; fetched 14:49 UTC,
149,600 B): the per-province Shapefile product's **`CONSTRU`** table is *"Subparcelas urbanas que
representan los volúmenes edificados dentro de una parcela"*, fields `REFCAT VARCHAR2(14)` +
**`CONSTRU VARCHAR2(16)`** — i.e. exactly the `PG-LI` polygon + `PG-AA` volumetría code, nationally,
per province, twice yearly (P5 §5.6). **Channel (a) therefore has a legitimate bulk path and needs
no per-parcel scraping.**

⭐ And the spec publishes the **controlled vocabulary** (ANEXO I): `-I,-II` bajo rasante · `I,II`
sobre rasante · `B` balcón · `T` tribuna · `TZA` terraza · `POR` porche · `SOP` soportal · `PJE`
pasaje · `MAR` marquesina · `P` patio · `CO` cobertizo · `EPT` entreplanta · `SS` semisótano.

---

## L1-2 · (b) FXCC **POR PLANTAS SIGNIFICATIVAS** — it exists as a distinct product · **richest attributes, still 2D**

**It is a distinct product on a distinct endpoint** (`DescargaFXCC.aspx`, not `GeneraFXCU1.aspx`),
not a parameter. ES-B, 14:41 UTC → **ZIP 4,179 B** = `{.dxf 39,970 B, .asc 789 B}`.

**⭐ ES-A RETURNED NO DATA**: `<script>alert('No se han encontrado datos para esta parcela.')`.
The flagship Barcelona parcel — 161 units, 133 dwellings, 19,567 m² official area (lane ES-1.2) —
**has no FXCC-por-plantas.** P5's *"si existe para esa parcela"* is not a footnote; see L1-5.

**DXF layer scheme (measured):** `PG-*` plus **`PS01`…`PS06`** — one block per *significant* floor,
suffixed `-LP` · `-LI` · `-AS` · `-AU` · `-TO` · (`-LF` on PG only).
This **confirms §L2-3's spec reading against a real file**, and adds one layer L2 did not list from
the spec table it flagged as column-offset: **`PS0n-TO` carries free-text room labels** —
`SALA`, `JUNTAS`, `CCE ALIMENTACION`, `V PORTERO`, `AZOTEA`. These exist in **no other channel**.

| Layer | Content measured (ES-B) |
|---|---|
| `PSnn-AU` | unit/use designators: `COM.TA-`, `COM.VA-`, `AAL.T1..T9`, `AAL.DR`, `CCE.IZ`, `CCE.DR`, `COM.VP`, `V.DR`, `V.IZ`, `PTO` |
| `PSnn-AS` | m² per local: `30,29,8,8,8,8,8,8,8,8,8,20` (sótano) · `168,168,7,43,16` (a dwelling floor) |
| `PSnn-LI` / `-LP` | interior + perimeter polylines, **per floor** |
| `PSnn-TO` | ⭐ free-text room labels |

⛔ **Again ZERO group-code 30/38 — the by-floor FXCC is also strictly 2D.**

**`.asc` (789 B) — the richest attribute payload in the whole family.** Measured field order
**confirms §L2-3's `NUMPLS`/`NUMPLR`/`NOMPL`/`NUMUSOS` reading exactly**:
`28 · Madrid · 900 · MADRID · 01215 · CL · CASTELLO · 0047 · 2255404 · VK4725E · DR/IZ/FD ·
0000 · 25/05/18 · 0000723 · 0001769 · 0000151 · 0001920 · 06 · [01 · "PLANTA SOTANO -1" · 12 ·
(AAL.DR,20)(AAL.T1,8)…(COM.VA-,29)] · [01 · "PLANTA BAJA 00" · 05 · …] …`

⭐ **Semantics I could VALIDATE arithmetically** (this is why the reading is safe):
`0000723` = parcel m² · `0001769` = **construida SOBRE rasante** · `0000151` = **BAJO rasante** ·
`0001920` = total. **1769 + 151 = 1920 ✓**, and Σ of the 12 SOTANO local areas = **151 ✓**.
**The above/below-rasante split is a datum INSPIRE's single `OfficialArea` does not carry** — and
it is precisely the split Spanish edificabilidad needs, since most ordinances count only sobre rasante.

**⛔ Freshness — por-plantas is a STORED 2018 ARTEFACT, not live.**
ZIP entry mtime **2018-05-25 13:18:12**; `.asc` date field **`25/05/18`**. The same parcel's
planta-general, fetched minutes later, is dated **`01/09/26`** and reads `723 / 1771.00 / 157.00 /
1928.00`. **The by-floor product is 8 years stale and already 8 m² adrift** (1769→1771, 151→157).
Any Pryzm surface using it must show the FXCC date, which the `.asc` conveniently carries.

---

## L1-3 · (c) PARCEL KML — keyless, but its 3D is 100 % DERIVED

`BuscarParcelaGoogle3D.aspx?…&tipo=3d`. ES-A 14:36 UTC → **17,589 B**; ES-B 14:40 UTC → **9,109 B**.

⚠ **UA filter, not a block.** Cold `curl` with no `User-Agent` → **HTTP 400, 2,189 B** — byte-identical
in size to P1's soft-block page. **The same request with a browser UA → HTTP 200.** P1's WAF
diagnosis must not be extended to this host/path on a 400 alone; check the UA first
(*probe-can-be-wrong-three-ways*).

**Structure (ES-A):** 20 Placemarks — parcel perimeter (z=0) · `Folder SUBPARCELAS` with 18
recintos · 1 address Point. Each recinto is named by its **roman-numeral code** and carries
`<extrude>1</extrude>`.

**⭐ The z-ordinate IS the roman numeral × 3 m — measured, exhaustively:**

| name | altitudeMode | z |
|---|---|---|
| `-I+VI` | relativeToGround | **18** (= 6 × 3) |
| `-I+I` | relativeToGround | **3** (= 1 × 3) |
| `-I`, `P`, `ESC` | clampToGround | **.1** |

ES-B: `-I+V` → **15**, `IV`/`-I+IV` → **12**. **The below-ground count is discarded entirely.**

`tipo=` probe (14:51 UTC): `3d`→9,109 B · `2d`→8,676 B · `plantas`/`planta`/empty→1,700 B stub.
**There is no by-floor variant on this endpoint.**

⭐ **Verdict: channel (c) carries ZERO information Pryzm does not already hold.** Its inputs are the
`CONSTRU` polygon + volumetría code (bulk, L1-1) or INSPIRE `BuildingPart` floors + footprint
(P6, bulk ATOM). **Class D — compute it, do not fetch it.**

---

## L1-4 · (d) ⭐⭐ **KML BY FLOORS — THE FLOOR-LEVEL PRIZE** · keyless, real per-floor geometry

`FXCC_KML.aspx?refcat=&del=&mun=`. **ES-B cold GET, 14:38 UTC → HTTP 200 · 177,075 B ·
`application/vnd.google-earth.kml+xml` · no cookie, no session, no captcha, no referer.**

**Structure: 7 Folders · 41 Placemarks · 430 Polygons · 40 GeometryCollections.**

| Folder | units | Σ floor-plane area (my computation) | z band |
|---|---|---|---|
| PLANTA GENERAL | 6 | 724.3 m² | flat 3.1 |
| PLANTA SOTANO -1 | 12 | 157.6 m² | 0 → 3 |
| PLANTA BAJA 00 | 6 | 359.8 m² | 3 → 6 |
| PLANTA 01 | 4 | 359.9 m² | 6 → 9 |
| PLANTA 02 | 4 | 359.9 m² | 9 → 12 |
| PLANTA 03 | 4 | 359.9 m² | 12 → 15 |
| PLANTA 04 | 4 | **335.2 m²** | 15 → 18 |

Every unit is a **closed watertight prism**: 2 horizontal faces (floor + ceiling) + N vertical wall
quads — e.g. `V.DR` on PLANTA 01 = 25 polygons (2 h + 23 v). Attributes per unit:

- `<name>` = unit designator — `V.DR`, `V.IZ`, `CCE.IZ`, `COM.VA`, `AAL.T1`…
- `<description>` = **use in plain language** — `Vivienda` · `Local` · `Local COMUN` · `Almacén`
- `<styleUrl>` = P4's uso/destino symbology — `#vivienda` `#comercio` `#comun` `#almacen` `#pg-sobre` `#pg-solar`

⭐ **My computed areas validate against the `.asc` independently**: PLANTA GENERAL Σ = 724.3 vs
`.asc` parcel 723; SOTANO Σ = 157.6 vs `.asc` bajo-rasante 157.00. **The geometry and the
alphanumeric agree — the KML polygons are trustworthy as areas.**

⭐ **Per-floor footprints genuinely DIFFER** (359.9 → **335.2 m²** at PLANTA 04, −6.9 %). This is
real information not derivable from floors × footprint. And it **cross-confirms lane ES-B's Madrid
zoning probe**, whose `VPLA_V_ORDENANZA` feature reads `IT_ATICO = "Si. Retranqueado 3m"` — the
ordinance says the ático is set back, and the cadastral by-floor geometry shows the top floor
smaller. Two independent sources, one fact. *(Areas are equirectangular-projected, ±1 %; the 24.7 m²
delta is far above that noise, but "consistent with a retranqueo" is the honest phrasing, not "proves".)*

### ⭐ The KML pre-expands `NUMPLR` — you do not have to

§L2-3 correctly warns that FXCC floors are *significant* floors with a real-floor multiplicity.
**The KML generator has already done that expansion**, and it labels the copies:
`Planta de 2 a 5(1/4)` `(2/4)` `(3/4)` `(4/4)` · `PLANTA 02 A 05(1/4..4/4)` · `PLANTA 02 Y 03(1/2..2/2)`.

⛔ **But the honesty caveat survives intact and must be carried forward**: the four copies are one
surveyed croquis replicated. For `2255401VK4725E` the KML renders **8 floors from 5 distinct
croquis**. *"Spain has per-floor geometry"* is an overstatement; **"Spain has per-floor-GROUP
geometry, expanded to floors with an explicit `(n/m)` marker"** is the true claim.

---

## L1-5 · COVERAGE — measured, and it is the binding constraint

`FXCC_KML.aspx`, one request per parcel.

**Two contiguous city blocks (neighbour refcats taken from each parcel's own `colindantes` ZIP):**

| Block | Result |
|---|---|
| **Barcelona** `2940601 / 2940602 / 2940610 / 2940611 / 2940619 DF3824B` | **0 / 5** — all empty |
| **Madrid** `2255401…2255408, 2255412, 2255417 VK4725E` | **10 / 10** — 54 KB – 702 KB |

**National spot-check, one central parcel per city (14:46 UTC, refcats via `Consulta_RCCOOR`):**

| City | del | refcat | bytes |
|---|---|---|---|
| Madrid | 28 | 2255404VK4725E | 177,075 ✅ |
| Valencia | 46 | 5826602YJ2752F | 207,795 ✅ |
| Málaga | 29 | 3251405UF7635S | 192,813 ✅ |
| Sevilla | 41 | 5121002TG3452A | 5,886 ⚠ **(no geometry — see L1-7)** |
| Barcelona | 8 | 2940601DF3824B | 0 ❌ |
| Zaragoza | 50 | 6735614XM7163F | 0 ❌ |
| Vigo | 36 | 3158602NG2735N | 0 ❌ |
| Murcia | 30 | 4261606XH6046S | 0 ❌ |

**Verdict: coverage is partial, heterogeneous, and appears to cluster by territory rather than by
building** — 0/5 across a whole Barcelona block vs 10/10 across a whole Madrid block is not a
per-building lottery. n=8 cities + 15 parcels is far too small to publish a percentage, and I do
**not** publish one. What is established: **it is not national, and Barcelona — PRYZM's most
developed city — is a MISS.** This matches P4's own 2008 note that the FXCC corpus *"aún no es muy
alto"*, and it is the single fact that decides whether the channel can carry a product feature.

⛔ **There is no coverage index.** The only way to know is to ask and inspect the response.

---

## L1-6 · AT SCALE — captcha measured, rate limits measured, bulk measured

### The captcha gate is real (channels a, b, b′)

The 40-hex `captcha=` token is minted server-side by the ViewState postback. Four tests, 14:42 UTC:

| test | result | meaning |
|---|---|---|
| replay ES-B token on ES-B refcat | **200, 4,179 B ZIP** | **not single-use** |
| ES-A-issued token on ES-B refcat | **302 → `/OVCError.aspx`** | ⭐ **token is PARCEL-BOUND** |
| `0000…0000` (40 hex) | **302 → `/OVCError.aspx`** | **not forgeable** |
| no `captcha` param at all | **302 → `/OVCError.aspx`** | gate is mandatory |

One token serves all three products for its refcat. **Cost per parcel: 1 GET + 1 POST + 1 GET,
with ASP.NET session state.**

⚠ **Honest note, stated as a finding and NOT as a recipe:** in the path I exercised, the postback
minted a token **without presenting any visual challenge**. I did not see the human challenge P5
§3.1.3.6 describes; whether it triggers after N requests, or on a different entry point, is
**NOT CONFIRMED**. This does not make automation permissible — the DGC's stated purpose is
*"evitar descargas automatizadas"*, and doing it at volume is squarely what P2 §4 (automatic
per-user suspension for access *intensidad/frecuencia*) and P5 §3.2 (*"NO al barrido sistemático"*)
forbid. **The absence of a visual challenge is a fact about the gate, not a licence.**

### Rate limits — MEASURED, not assumed

The terms permit this: P5 §3.2 documents **7,200 requests/hour per IP** (→ 4-hour denial) for the
`.svc` family, and P2 §4's clause is about degrading other users. A 20-request sequence at ~0.7/s
cannot do that and is ~1 % of the documented hourly allowance.

**20 sequential GETs, no delay, `FXCC_KML.aspx`, 5 distinct Madrid refcats × 4 rounds,
14:44:09 → 14:44:38 UTC (29 s, 0.69 req/s):**
**20 / 20 HTTP 200.** Latency 0.62–2.69 s, correlated with payload size (702 KB → 2.5 s) and
**not** with request index (round 4 was no slower than round 1). **No 429, no CAPTCHA challenge,
no soft-block, no degradation.**

⭐ **This is a different WAF posture from P1's.** P1 measured the *INSPIRE* `ovc.catastro.meh.es`
`.aspx` family soft-blocking the entire host after ~20 requests in ~10 min. **`www1.sedecatastro.gob.es`
`FXCC_KML.aspx` did not trip at the same volume in 1/20th the time.** Do not carry P1's soft-block
figure across hosts. Equally: **20 requests establishes no ceiling.** I did not search for the
breaking point — doing so is the abuse the licence names.

### Bulk — measured, and this is the decisive asymmetry

| Layer of the by-floor product | In bulk? | Where |
|---|---|---|
| Planta-general **geometry** + volumetría | ✅ **YES** | Shapefile `CONSTRU` per province, 2×/yr (P5 §5.6) |
| Per-floor **attributes** (planta · destino · superficie) | ✅ **YES** | CAT format **type 14** — *"Registro de Construcción… uno por cada construcción de cada unidad constructiva en cada parcela"*, carrying `Bloque/Escalera/`**`Planta`**`/Puerta` (pos. 246–257), `Código de Destino`, `Tipología constructiva` (`catastro_fin_cat_2006.pdf`, fetched 14:49 UTC, 733,420 B) |
| **Per-floor GEOMETRY** | ⛔ **NO** | **no bulk product contains it, at any access level** |

⭐ **This is the finding that decides the lane.** Per-floor *attributes* are bulk-available and, per
§L2-4, also keyless per-parcel via DNPRC. **Per-floor GEOMETRY exists ONLY through the per-parcel
FXCC/KML channels — there is no province download, no ATOM, no WFS, no authenticated bulk.**
The "bulk refusal may hide a query endpoint" check runs the other way here: the query endpoint
works and **the bulk product genuinely does not exist.**

---

## L1-7 · ⛔ FOUR DEFECTS A PRYZM ADAPTER MUST HANDLE — all measured

### D1 · ⭐⭐ THE BASEMENT STACK-SHIFT — the by-floor KML systematically OVER-HEIGHTS buildings

The by-floor KML stacks **every** floor from z=0 upward, **including true sótanos**, because (P4)
basements cannot render below the terrain model. The parcel KML (channel c) instead **omits**
below-rasante volumes. **The two DGC products therefore disagree about the same building.**

| refcat | parcel-KML top | by-floor-KML top | Δ | sótano levels |
|---|---|---|---|---|
| `2255404VK4725E` | 15 m (`-I+V`) | **18 m** | +3 | 1 (`-I`) |
| `2255402VK4725E` | 21 m (`-I+VII`) | **24 m** | +3 | 1 (`-I`) |
| `2255407VK4725E` | 24 m (`-II+SS+VII`) | **30 m** | **+6** | 2 (`-II`) |
| `2255401VK4725E` | 24 m (`VIII`) | 24 m | **0** | 0 |

⭐ **The rule is exact and holds 4/4:**
`by-floor top = parcel top + 3 m × (count of true sótano levels)`.
Semisótano (`SS`) is counted above-rasante by **both** products, so it does not contribute to Δ.

⛔ A naive ingest of `2255407VK4725E` would place its roof at **30 m instead of 21 m of real
above-ground fabric — a 43 % overstatement.** This is the *envelope-solid-overstates-on-partial-data*
family exactly. **The correction is deterministic and Class D**: parse the folder labels, count
below-rasante floors, subtract 3 m each.

### D2 · THREE DIFFERENT "NO DATA" SHAPES, none of them an error status

| shape | example | trap |
|---|---|---|
| HTTP **200, 0 bytes** | Barcelona ×5, Zaragoza, Vigo, Murcia | *empty ≠ failure* — indistinguishable from a truncated response |
| HTTP **200, well-formed 5,886 B KML with 0 Folders / 0 Polygons** | Sevilla `5121002TG3452A` | ⛔ **passes any "is this valid KML?" check** — styles, `LookAt` and an address Placemark, no geometry |
| `<script>alert('No se han encontrado datos…')` returned from a download flow | ES-A FXCC-por-plantas | HTML masquerading as a file |

⛔ **An adapter must gate on `count(Folder with ≥1 Polygon) > 0`, never on HTTP status or byte length.**
And the two products' coverage differs **in both directions**: `2255408VK4725E` returns
**110,650 B of by-floor geometry** while its parcel KML returns `PARCELA NO ENCONTRADA`
(measured once, 14:51 UTC — recorded as an observation, not yet a rule).

### D3 · THE ENCODING DECLARATION IS WRONG

`FXCC_KML.aspx` returns `Content-Type: …; charset=utf-8`, the bytes **are** UTF-8
(`Almac\xc3\xa9n`), but the XML prolog declares `<?xml version="1.0" encoding="ISO-8859-1"?>`.
⛔ **A conforming XML parser honours the prolog and produces mojibake** — Python's ElementTree
yielded `AlmacÃ©n` for `Almacén`. Every accented use label (`Almacén`, `Simbología`) is corrupted
unless the prolog is overridden to UTF-8.

### D4 · FLOOR LABELS ARE FREE TEXT WITH NO CONTROLLED VOCABULARY

Measured across 9 buildings: `PLANTA SOTANO -1` · `PLANTA -1` · `PLANTA -01` · `Planta de -1 a -1` ·
`Planta baja` · `PLANTA BAJA` · `PLANTA BAJA 00` · `PLANTA 00` · `Semisótano` ·
`PLANTA SEMISOTANO SM` · `PLANTA BAJO CUBIERTA` · `Planta de 2 a 5(1/4)` · `PLANTA 02 A 05(1/4)` ·
`PLANTA 02 Y 03(1/2)`. Mixed case, mixed phrasing, two range syntaxes, mojibake.

⛔ **Determining above/below rasante — which D1 depends on — requires parsing this free text.**
§L2-3's rule (name starts `-`, **or** any floor below the one named BAJA/00) is the right one and
survives my sample, but it is a *heuristic over free text*, so it needs a fixture corpus and an
explicit refusal branch, not a regex shipped on faith.

⚠ Also: **`PLANTA GENERAL`'s z is meaningless.** Measured 3.1 · 0.1 · 9.1 · 18.1 · 21.1 across
parcels with tops of 18 · 15 · 12 · 21 · 24 m. It follows no rule I could establish. **Never read
height from it.**

---

## L1-8 · ⭐ FOUR OFFICIAL GFA READINGS OF ONE BUILDING, ALL DIFFERENT

`2255404VK4725E`, all measured this lane or derived from artefacts measured this lane:

| Source | Total constructed | Above rasante | Below |
|---|---|---|---|
| FXCC **por plantas** `.asc` (2018 vintage) | **1,920 m²** | 1,769 | 151 |
| FXCC **planta general** `.asc` (live, 01/09/26) | **1,928 m²** | 1,771.00 | 157.00 |
| My **KML polygon integration** | **1,932 m²** | ~1,775 | 157.6 |
| **DNPRC** `Consulta_DNPRC` Σ`sfc` (10 units: 8 Residencial + 2 Comercial), 14:53 UTC | **1,900 m²** | — | — |

**Spread 32 m² (1.7 %) across four official channels.** DNPRC is lowest because it sums *inmuebles*
and apportions elementos comunes differently — note the by-floor KML lists **34 locales** where
DNPRC lists **10 inmuebles**, because `COM.*` common elements are locales but not separate
inmuebles. ⛔ **"The" official Spanish GFA does not exist**; pick one channel, name it, and never
present the number as exact. *(Never-overstate applies to areas, not only to envelopes.)*

---

## L1-9 · A / B / C / D CLASSIFICATION

| # | Channel | Access measured | Bulk? | **Class** | Why that letter |
|---|---|---|---|---|---|
| a | FXCC planta general (per-parcel) | captcha token | — | **B** | downloadable, access-constrained by a real parcel-bound gate |
| a-bulk | Shapefile **`CONSTRU`** per province | Cl@ve/cert, 2×/yr | ✅ | **B** | same content, authenticated bulk — *the product built for scale* |
| b | **FXCC por plantas** (per-parcel) | captcha token | ❌ none | **B** | richest attributes (`-AU`,`-AS`,`-TO`, above/below split); no bulk at any tier |
| b-attrs | CAT **type-14** per province · DNPRC per parcel | Cl@ve / keyless | ✅ | **A** | floor-level *attributes* are genuinely authoritative + machine-readable (§L2-4) |
| c | Parcel KML `tipo=3d` | keyless (needs UA) | — | **D** | content is 100 % `footprint × roman-numeral × 3 m` — Pryzm already holds both inputs |
| d-geom | **KML por plantas — per-floor polygons + per-unit use** | ⭐ **keyless, un-gated** | ❌ none | **B** | *technically* A-grade access; **B** because undocumented, no contract, no bulk, licence forbids redistribution and caps volume |
| d-z | KML por plantas — the **z / floor heights** | keyless | — | **D** | the constant 3.0 m restated; **measured 3.0 m in 55/55 floor bands across 9 buildings — no real height exists** |
| — | Visor 3D (P5 §3.1.1.6) | browser | — | **C** | visual-only; **not probed, not scraped** (brief constraint) |

---

## L1-10 · WHAT A PRODUCTION PRYZM ADAPTER MAY USE AT SCALE

**✅ USE — legal and technical at scale**

1. **Shapefile `CONSTRU` + CAT type-14, per province, twice yearly (authenticated).** This is the
   channel the DGC built for volume. Gives planta-general geometry + volumetría + per-floor
   attributes nationally. Licence duties (P5 `licdescargaES.pdf`): transform, cite
   *"Dirección General del Catastro"* **and the access date**, never re-serve the original, never
   brand output *"cartografía catastral"*, 10-year term.
2. **Compute channel (c) rather than fetching it** — it is Class D and PRYZM already holds its inputs.
3. **DNPRC / INSPIRE for floor-level attributes** (§L2-4, P6) — keyless, national, no captcha.

**⚠ USE ONLY ON-DEMAND, LOW VOLUME, CACHED — never swept**

4. **`FXCC_KML.aspx` (channel d).** It is the **only** source of per-floor *geometry* in Spain and
   there is no bulk alternative. Technically keyless; measured 20/20 clean at 0.69 req/s.
   Defensible shape: user-initiated, one parcel at a time, long-lived cache (the payload is a 2018
   artefact — it does not change), attribution + FXCC date surfaced, D1 basement correction applied,
   D2 emptiness gate, D3 encoding override, D4 label parsing with a refusal branch.
   ⛔ **Not defensible: a systematic sweep.** P5 §3.2 names *barrido sistemático* as out of scope
   and P2 §4 authorises automatic suspension on access intensity. The endpoint is undocumented and
   may vanish without notice — it must never become a hard dependency.

**⛔ DO NOT USE at scale**

5. **Channels (a) (b) (b′) per-parcel.** Reaching them requires minting the anti-automation token
   programmatically. Even though no visual challenge appeared in my path, automating a control
   whose published purpose is *"evitar descargas automatizadas"* is the abuse the licence names.
   Take (a) from bulk instead; **(b)'s unique content — `-TO` room labels, the above/below-rasante
   split — has no compliant bulk route and must be treated as unavailable at scale.**
6. **Visor 3D.** Never scraped, per the brief.

---

## L1-11 · NOT CONFIRMED (stays not confirmed)

- **National coverage % for by-floor data.** n=15 parcels / 8 cities. The territorial *pattern* is
  suggestive; the *percentage* is unmeasured and I publish none.
- **Whether a visual CAPTCHA ever fires** on the `OVCListaBienes` postback path, and after how many
  requests. Not observed; not tested (testing it means provoking the control).
- **The true rate ceiling of `FXCC_KML.aspx`.** 20 requests in 29 s is clean; the breaking point was
  deliberately not sought.
- **Whether channel-c gaps (`PARCELA NO ENCONTRADA` on `2255408VK4725E`) are systematic** or a
  transient. Observed once.
- **`GeneraGraficoParcela.aspx`** (raster croquis, keyless-looking GET in the page) returned
  **HTTP 200 / 0 B** cold at 14:53 UTC — likely session-bound. Not characterised.
- **Whether `PS`-block DXF geometry is byte-identical to the KML polygons.** Both validated against
  the same `.asc` areas; not diffed vertex-by-vertex.
- **Foral territories** (País Vasco, Navarra) are outside DGC (P3) — no FXCC/KML channel tested there.
