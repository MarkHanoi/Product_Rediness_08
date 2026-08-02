# §MURCIA-ENVELOPE-MAX — what the *ficha* adds to Murcia's envelope, measured

Answers one question: **the Región de Murcia WFS carries `Edificabilidad` *and* `Enlace_ficha`
— parameter and citation in one place, which no other Spanish region has. What does the ficha
actually BUY?**

⛔ **It authorises nothing.** No pack is registered, `envelopeAuthorisation.ts` is untouched,
nothing is published. This is measurement.

## Run it

```bash
node tools/murcia-envelope-max/01-schema-and-validity.mjs     # schema · enumeration · validity
node tools/murcia-envelope-max/02-which-layer-is-current.mjs  # the rival-workspace hunt
node tools/murcia-envelope-max/03-universes-and-currency.mjs  # 45 vs 33 vs 37, named
node tools/murcia-envelope-max/04-ficha-addressability.mjs    # the published link (it 404s)
node tools/murcia-envelope-max/05-find-live-ficha-channel.mjs # find the live one
node tools/murcia-envelope-max/06-ficha-live-matrix.mjs       # cold / referer / cookie matrix
node tools/murcia-envelope-max/08-control-28-09.mjs           # the known-answer control
node tools/murcia-envelope-max/09-wfs-parameter-census.mjs    # tier (a), per municipality
node tools/murcia-envelope-max/10-ficha-harvest.mjs           # tier (b) corpus — WAF-gated
node tools/murcia-envelope-max/11-ficha-extract.mjs           # tier (b) parameters
node tools/murcia-envelope-max/12-currency-verdict.mjs        # is the layer CURRENT
node tools/murcia-envelope-max/13-provenance-and-rank.mjs     # §5 rank vs Balears
node tools/murcia-envelope-max/14-report.mjs                  # the report block
```

Everything caches to `.cache/` (gitignored), so a re-run is free and costs the service nothing.
`--refresh` re-hits the network. `MURCIA_GAP_MS` sets the inter-request floor (default 1400 ms).

## The five headline findings

### 1 · ⭐ `Enlace_ficha` is 100 % POPULATED and 0 % RESOLVABLE AS PUBLISHED

All 9 469 zoning rows carry a ficha URL. Every one of them points at
`http://opweb.carm.es/sitmurcia/potgisfichacen.jsp?wide=N` — and that host returns **HTTP 404**,
including its own directory root. Request the *identical* URL over **`https://`** and it 302s to
the live `urbmurcia.carm.es`. That rewrite is published nowhere; it was found by probing.

**POPULATED IS NOT PRESENT.** A pipeline that trusted the attribute would have got 9 469 404s.

### 2 · ⛔ The channel is behind a **Radware Bot Manager** WAF — and the obvious detector is wrong

`urbmurcia.carm.es` serves a CAPTCHA interstitial **with HTTP 200**. That is the standard
"HTTP 200 is not success" trap. The *naive fix* is also wrong and cost this run real time:
Radware injects its sensor script (`SSJSInternal`, `__uzdbm_*`, `perfdrive`) into **successful
ficha pages too**, so a "does it mention perfdrive" test discards genuine fichas and reports the
channel as dead. `detect.mjs` therefore classifies **positively on the document**
(the `PROCEDURE FICHA` banner + the ámbito table), never negatively on the defence.

### 3 · ⭐ The ficha carries **no envelope parameter at all**

The page is emitted by an Oracle stored procedure — its own HTML opens with
`<!-- PROCEDURE FICHA ( WIde IN Number ) -->` — over a **fixed label set**:

> Municipio · Superficie · Denominación · Nombre · Clasificación del Suelo · Uso global ·
> Aprovechamiento de referencia · Otros usos · Superficie total del ámbito de ordenación ·
> Superficie neta del ámbito · Aprovechamiento resultante · SSGG vinculados/adscritos ·
> Densidad (viv/Ha) · Habitantes estimados por planeamiento · Nº de viviendas máximo ·
> Viviendas estimadas · Observaciones · Documentación adicional

**No `altura`. No `plantas`. No `ocupación`. No `retranqueos`. No `fondo edificable`. No
`parcela mínima`.** It is a **development-quantum sheet**, the same class of quantity as the
`Edificabilidad` attribute: floor area and dwelling counts, **no shape**.

Corroborated independently: the INSPIRE view `SIT_USU_PLU_CARM:sitmurcia_plu_ze` has a
`dimensioningIndication` field — the INSPIRE model's own slot for dimensioning parameters — and
it is **non-null on 0 of 9 470 rows**.

### 4 · §4 consequence — the ficha moves **nothing** into drawable

`footprint rule + height` draws. `Edificabilidad` alone does not. The ficha adds neither, so
tier (b) adds **0 pp of drawable coverage** over tier (a). Murcia's regional service is
**0 % complete-rule, 0 % partial-drawable, 100 % not-drawable** — for all 33 zoned
municipalities, at *any* `Edificabilidad` coverage.

### 5 · §5 rank — the posed comparison **does not run**

Balears = **parameters without provenance** (real `PM`/`NP`/`O`/`E`, 3 of 60 cite an article).
Murcia = **provenance without parameters** (a resolving BORM gazette citation for 44/45
municipalities, and no parameter for an article to be cited *for*).

Murcia is therefore **not the strongest `P` in Spain**. On the axis that decides whether an
envelope draws, **Balears strictly dominates Murcia.**

## Method notes that are load-bearing

- **Filter-applied proof.** Every count is preceded by a negative control: an impossible CQL
  value must return 0 while the unfiltered count is > 0. HTTP 200 is not an applied filter.
- **Truncation.** `numberMatched` is compared against `features.length` on every fetch and the
  run throws on a mismatch; counts landing on 1000/2000/3000/5000 are flagged.
- **Decompositions must sum.** `assertSums` throws rather than emit an unbalanced figure.
- **Zero-information fields are named as such.** `Area_suspendida` is `"S"` on 100 % of its
  non-null rows; `regulationNature` is `definedInLegislation` on 100 % of 9 470;
  `ProcessStepGeneral` is `legalForce` on 45/45 in two casings. **None is cited as evidence** —
  that is the Aragón `fiab_geom` / Balears `DFIVIGEN` failure shape.
- **A bad join key nearly produced a false alarm.** Comparing the two workspaces on
  `(Municipio, Uso, Area_m2)` gave 5.41 % overlap, which reads as "rival editions disagree".
  It was float-precision skew. On the genuine shared key — the ficha link — overlap is **100 %**.

## Files

| File | Role |
|---|---|
| `lib.mjs` | polite cached transport · WFS helpers · negative controls · `assertSums` |
| `detect.mjs` | ⭐ the ficha/CAPTCHA classifier, and why the obvious one is wrong |
| `01`–`03` | schema, rival-workspace hunt, the three universes |
| `04`–`06` | the ficha channel: dead published link → live host → addressability matrix |
| `07` | field dictionary derived from the documents |
| `08` | the 28.09 % known-answer control |
| `09` | tier (a) — per-municipality `Edificabilidad`, on an audited denominator |
| `10`–`11` | tier (b) — seeded ficha corpus and parameter extraction |
| `12` | the currency verdict, with its residual risk stated |
| `13` | provenance channels and the §5 rank |
| `14` | the report block |
| `out/*.json` | every measurement, with its own timestamp |
