# Murcia — the DERIVED-VARIABLE INVENTORY, and the COVERAGE-LOSS MATRIX

**Date:** 2026-08-02 · **Asks:** founder, *"How many other ordinance variables are also implicitly
constructible?"* · **Governs:** ADR-0285 (four-part test) · ADR-0287 (refuse on band-changing
uncertainty) · BLOCKER-CLASSIFICATION-STANDARD
**Source for every citation:** the filed
[`../corpus/pdf/PGOU-MURCIA_TR-2012-12_vol11_normas-urbanisticas.pdf`](../corpus/pdf/PGOU-MURCIA_TR-2012-12_vol11_normas-urbanisticas.pdf)
(SHA-256 `ab71c651…`, 205 pp), quoted verbatim.

---

## 0 · ⚠⚠ READ THIS FIRST — the inventory found something that bears on SIG-MU2 itself

The question *"what else is constructible?"* was asked of Título 5 (the zone ordinances). Answering
it required reading **Título 4, Capítulo 5** — the general height chapter — which nobody had read,
because the zone articles are where the numbers live.

**Art. 4.5.3 «Alturas en función del ancho de la calle» PRESCRIBES A MEASUREMENT METHODOLOGY FOR
STREET WIDTH.** Verbatim:

> «En las zonas en que el límite de alturas … se fije en función del ancho de la calle, **el ancho de
> las vías públicas será el que conste en los planos de ordenación (ancho entre alineaciones de
> parcela)**, medida del modo siguiente:
> **a)** Aplicación estricta de la **regla de media aritmética** cuando el ancho de calle medida como
> distancia entre las alineaciones oficiales del Plan General varíe en más de un 50% de su longitud,
> **hasta completar la manzana**.
> **b)** Aplicación **ponderada** de la regla de la media aritmética cuando la anchura de la calle no
> varíe … más del … 50%. … **i)** Variación hasta en un 25% de su longitud: se tendrá en cuenta sólo
> el ancho que represente el mayor porcentaje … **ii)** Variación entre el 25% y el 50%: a la
> distancia que resulte el ancho mayor … se le aplicará el **índice 1,50**, efectuándose entonces la
> media aritmética … **iii)** Cuando las distancias … difieran entre sí en más de la tercera parte,
> se considerará que existen **distintos tramos de calle**.
> **2.** Cuando las alineaciones de calle no sean paralelas entre sí, se tomará como ancho el
> **promedio de las distancias medidas en cada tramo de calle**.»

### 0.1 · What this CONFIRMS

**The input choice is vindicated by the ordinance's own words, not by analogy.** Art. 4.5.3 defines
the width as *«ancho entre alineaciones de parcela»* — the distance between parcel alignment lines.
That is exactly what `resolveMurciaStreetWidth` measures, from exactly the layer the municipality
publishes those alignments in (`Murcia:pgou_alineaciones`). We are measuring the right thing, off
the right source.

### 0.2 · ⚠ What this CONTRADICTS — and it is SIG-MU2's stated rationale

SIG-MU2's approval rests on:

> *"The ordinance makes street width the legal criterion. **It does not prescribe a measurement
> methodology.** Computing that width from authoritative geometry is an implementation of the
> ordinance, not a modification of it."*

**For Murcia, the second sentence is false.** Art. 4.5.3 prescribes a methodology in detail. Our
implementation diverges from it in two ways, both measured:

| | Art. 4.5.3 requires | PRYZM computes | direction of divergence |
|---|---|---|---|
| aggregation along the street | **arithmetic mean over the whole *tramo*, *hasta completar la manzana*** (weighted ×1.50 toward the wider part in the 25–50 % case) | **median of 5 rays across one block edge** | median ≠ mean; ours is local to one edge, not the tramo |
| choice between a parcel's frontages | Art. 4.5.4: on a corner, **the WIDER street governs** | `governingStreetWidth` takes the **NARROWEST** | ⚠ **we under-grant on corner parcels** |

**Neither divergence over-states.** The ×1.50 weighting and the corner rule both push the legal
answer *up*; taking the median of one edge and then the narrowest frontage pushes ours *down*. So
PRYZM is publishing **at or below** the ordinance's figure, and the ADR-0287 band-edge guard absorbs
most of the residual. **This is a correctness gap in the conservative direction, not an L-616
over-statement** — but it is a gap, and SIG-MU2's premise needs amending rather than repeating.

`status: open · severity: under-publication + premise-defect · action: SIG-MU2's rationale should be
re-stated as "the ordinance prescribes a method we implement conservatively and divergently, and the
divergence is declared", OR Art. 4.5.3's aggregation should be implemented. Founder decision.`

⚠ **Do NOT "fix" this by simply switching `governingStreetWidth` to widest.** That function is
shared with Barcelona, whose Art. 327 resolves corners the *other* way and whose module header says
so explicitly. It needs a per-jurisdiction corner policy — which is precisely what §2's engine
proposal exists to carry.

---

## 1 · TASK 1 — THE DERIVED-VARIABLE INVENTORY

Every row is scored against **ADR-0285's four-part test**. A variable is derivable only if **all
four** hold:

> **(A)** criterion stated by the ordinance · **(B)** method unprescribed · **(C)** input is
> authoritative published geometry · **(D)** computation reproducible

| # | Variable | Ordinance requires it? | Published directly? | Derivable? | Article | Fails which test |
|---|---|---|---|---|---|---|
| 1 | **Street width** | **Yes** | No (not in WFS; the *planos de ordenación* figure is not machine-readable) | ✅ **DONE — shipped** | 4.5.3 · 5.3.3 · 5.5.3 · 5.7.3 · 5.9.3 | ⚠ **(B) — method IS prescribed** (§0.2). Shipped anyway, conservatively, under SIG-MU2 |
| 2 | **Corner condition** | **Yes** — *«En solares en esquina … se tomará la altura correspondiente a la calle de mayor ancho»* | No | ✅ **YES — highest-value next row** | **4.5.4** · 5.4.3.2 (MG) | none. All four hold |
| 3 | **Opposite-frontage split** | **Yes** — *«En los solares con fachadas opuestas a calles con diferente ancho se tomará para cada calle la altura correspondiente»* | No | ✅ **YES** | **4.5.6** | none |
| 4 | **Plaza frontage** | **Yes** — *«la altura … será la correspondiente al ancho menor de la plaza»* | No | ✅ **YES** (needs the plaza polygon: `EV`/`EW` espacios libres, published) | **4.5.5** | none |
| 5 | **Frontage length** (*frente mínimo*) | **Yes** — parcela mínima carries a frontage minimum: RM *«frente mínimo de 7 m»*, RD *«lindero frontal 6 m»*, RF *«15 m de frente»*, RG *«20 m de frente»*, RL *«30 m de fachada»*, IC *«6 m de frente»* | No | ✅ **YES** — the length of the parcel edge coincident with the alineación | 5.5.3 · 5.9.3 · 5.10.3 · 5.11.3 · 5.14.3 · 5.18.3 | none. But it gates **segregation**, not the envelope — low value |
| 6 | **Block depth / orientation** | **Yes** — *«En manzana de nueva promoción, con tres de sus fachadas de 50 metros o más de longitud, se edificará bajo la tipología de patio interior de manzana»* | No | ✅ **YES** — measure the manzana's façade lengths; we already hold the block ring | **5.5.3** | none. Changes the rule KIND (patio interior), not a scalar — ADR-0270 shape work |
| 7 | **Buildable depth** (*fondo máximo edificable*) | **Yes** | ✅ **YES — STATED as 15 m** in the article text | ❌ **N/A — no derivation needed** | 5.3.3 · 5.5.3 · 5.7.3 · 5.9.3 | fails **(A/B) trivially**: it is a published scalar. Deriving a stated number would be strictly worse |
| 8 | **Alignment continuity** | **Yes** — *«La edificación coincidirá con la alineación y no se permitirán retranqueos, ni frontales, ni laterales»* | ✅ **YES — the alineación IS the published geometry** | ❌ **N/A** | 5.3.3 · 5.5.3 | not a derivation: the line is the datum, already consumed |
| 9 | **Eje Comercial** ⭐ | **Yes** — *«5 plantas (16 m) en Ejes Comerciales con sección mayor de 12 metros»* | ✅ **YES — `Murcia:pgou_eje_comercial` is a PUBLISHED LineString layer** | ❌ **NOT derivable — and it does not need to be** | 5.5.3 | fails **(A)**: it is a **published designation**, not a computable condition. ⚠ **The 0.7 % `needs-eje-comercial` refusal is therefore bucket (3) ENGINEERING, not (2) data-unavailable.** The layer exists; we simply do not query it |
| 10 | **Adjacency / neighbour-derived** | **Yes** — RT: *«las mismas que las de las fincas colindantes»*; RB: *«sin superar la edificabilidad actual del edificio existente»*; RU: *«respetará los parámetros de la edificación preexistente»* | No | ❌ **NO** | 5.21.3 · 5.8.3 · 5.15.3 | fails **(C)**: the input is the neighbour's **legal regime and built volume**, not geometry. A footprint does not tell you a neighbour's *edificabilidad*. Refusal is correct and terminal-ish |
| 11 | **Rasante / terrain datum** | **Yes** — *«La altura se mide desde la rasante oficial»*; abierta: *«sobre la rasante natural … referida al baricentro»* | No (*rasante oficial* is a surveyed municipal datum) | ⚠ **PARTIAL** | **4.5.1.2** · 4.5.2 | fails **(C)** for *rasante **oficial*** (a legal datum, not terrain). ⚠ Terrain DEM ≠ rasante oficial — the L-584 defect verbatim. Derivable only for the *rasante natural* (abierta) case |
| 12 | **MC 6-planta exception** | **Yes** — streets *graphed with an axis line* on the 1/2.000 sheets | ❌ No (the graphic is not published as data) | ❌ **NO** | 5.2.3 | fails **(C)**: the input is a cartographic annotation nobody publishes as geometry |
| 13 | **MZ / MX** | **Yes** | No | ❌ **NO** | 5.6.3 · 5.22.3 | MZ fails **(A)** — footprint *expressly delegated* to an Estudio de Detalle, so there is no criterion to compute. MX needs a *frontage class* (principal vs secundaria), which is a designation, not a measurement |

### 1.1 · The answer, in one line

**Of 13 variables the PGOU's buildable-zone articles depend on: 6 are genuinely derivable
(1 shipped, 5 not), 2 are already published as scalars or geometry, 1 is a published designation we
simply do not query, and 4 are not derivable at all** — three because the input is a legal regime or
a cartographic annotation rather than geometry, one because the ordinance delegates the question.

**Rows 2, 3 and 4 (Arts. 4.5.4 / 4.5.5 / 4.5.6) are a single coherent family** — the general
"height as a function of street geometry" chapter — and they run **off the width measurement PRYZM
already computes per edge**. `measureStreetWidths` returns a per-edge result; today
`governingStreetWidth` collapses it to one number and throws the rest away. **These three rows are
the highest-value derivation work left in Murcia, and none of them needs a new data source.**

⚠ **But see §3: their axis value is small.** They are correctness wins inside already-computable
land, not coverage wins.

---

## 2 · TASK 3 — THE COVERAGE-LOSS MATRIX

100 % of Murcia's private buildable land (**75.145 M m²**, L-656), assigned to exactly one bucket.
Shares are measured, not estimated; sources per row.

| bucket | share | what it is | source |
|---|---:|---|---|
| **— (envelope PUBLISHES)** | **28.03 %** | 23.51 pp packed+direct (SIG-MU1) + 4.52 pp street-width (SIG-MU2, measured) | `ENVELOPE.md` §3.3.3 |
| **(1) Legally impossible** | **67.00 %** | the PGOU expressly delegates to a derived instrument — Arts. 5.24 / 5.25.3.3 / 5.26.3.3 / 6.2.2.3 / 6.5.1 / 6.6. *«…se reduce a las condiciones de uso y tipología …, pero no a los parámetros definitorios de la altura o edificabilidad»* | crosstab, `ENVELOPE.md` §2 |
| **(2) Data unavailable** | **0.21 %** | `MZ` — height is stated but the **footprint is expressly delegated** to an Estudio de Detalle. ⚠ Arguably (1); classified (2) because the *height* half is computable and only the footprint input is missing | `ENVELOPE.md` §3.2 |
| **(3) Engineering not yet implemented** | **4.76 %** | see breakdown below | this document |
| **(4) Awaiting authoritative interpretation** | **0.00 %** | **none.** Every Murcia refusal names an article. There is no row where PRYZM is waiting on a municipal reading | — |
| | **100.00 %** | | |

### 2.1 · Bucket (3) broken out — 4.76 pp, every item with a named reason

| item | share | why it is (3) and not (2) |
|---|---:|---|
| `RC`/`RM`/`RN` refused **`band-edge`** | **3.93 pp** | see §2.2 — the legal basis and the data both exist |
| `RC`/`RM`/`RN` refused `no-opposing-frontage` | 0.30 pp | the alineación geometry IS published; the rays found no facing frontage (block faces open ground, or the ring is not closed by neighbours). Better neighbourhood assembly is engineering |
| base `RM` refused **`needs-eje-comercial`** | 0.06 pp | ⭐ **`Murcia:pgou_eje_comercial` IS PUBLISHED.** We do not query it. Pure engineering — row 9 above |
| `MX`, `RB`, `RU`, `RT` and residual | 0.47 pp | ⚠ **partly mis-binned, and said so:** `RB`/`RU`/`RT` are neighbour-derived (row 10) and are really **(2)**; `MX` needs a published frontage class. Kept in (3) only because their individual shares are below the crosstab's resolution. **Do not quote this sub-row as engineering-only** |
| **`RD1` third storey** | **0.00 pp** | ⚠ **signed by SIG-MU2, deliberately NOT wired.** `RD1` already publishes 2 plantas / 7 m, so wiring it means *intercepting working output* to raise it. Costs **no coverage** — the land already renders — it only under-grants height on streets ≥ 8 m. Bucket (3), named reason, zero area at stake |

### 2.2 · ⚠ The 44.6 % band-edge rate is NOT a coverage-loss bucket — and here is the honest classification

The coordinator was right to flag this. **44.6 % is a share of `RC`/`RM`/`RN` land, not of the
city**, and it sits *inside* computable land. In city terms it is **3.93 pp** (8.81 × 0.446).

Classifying it honestly requires splitting it, because it is not one thing:

| cause | verdict |
|---|---|
| the **0.5 m substitution allowance** (`BAND_EDGE_GUARD_M`) — prices GIS-measured vs legally-declared width | **(3), but IRREDUCIBLE by better measurement.** It exists because we are substituting a measurement for the *ancho oficial* the ordinance names. Only publishing the declared width removes it — that is **(2) data unavailable** in disguise |
| the **measurement's own `spread_m`** widening the guard beyond 0.5 m | **(3) — genuinely reducible.** More rays, better ring assembly, or Art. 4.5.3's *tramo* aggregation would tighten it |
| **Murcia's street-width distribution** sitting on the band edge (median 8.78 m vs an 8 m threshold) | **neither (3) nor (2) — irreducible.** A fact about the city and its ordinance |

⚠ **And the one lever that would have moved it is closed:** the snap gate refused (max ×0.58 vs
Barcelona's ×7.55), so no quantisation can pull a measured 8.2 m onto a declared 8.0 m.
**Conclusion: of the 3.93 pp, the majority is irreducible without the *ancho oficial* being
published — i.e. it is really bucket (2) wearing bucket (3)'s clothes.** Recorded that way rather
than booked as future engineering headroom that does not exist.

---

## 3 · WHAT THIS IS WORTH — before anyone plans against it

**Little, in axis terms, and that must be said before the inventory is read as a roadmap.**

Murcia publishes at `estimated-ruleset` (weight **0.4**); SIG-MU1 records `authoritative` as
UNREACHABLE and **ADR-0285** confirms a methodology signature does not promote the tier. So:

| work | coverage gain | ENVELOPE axis gain |
|---|---:|---:|
| Arts. 4.5.4/4.5.5/4.5.6 (corner, plaza, opposite frontage) | **0 pp** | **0** — they change the HEIGHT on land that already publishes |
| query `pgou_eje_comercial` (row 9) | +0.06 pp | +0.02 pp |
| tighten `no-opposing-frontage` | ≤ +0.30 pp | ≤ +0.12 pp |
| wire `RD1` | 0 pp | 0 |
| **all of it** | **≤ +0.36 pp** | **≤ +0.15 pp** |

Axis today **11.21 %**; ceiling at the full 33.00 % PGOU-direct is **13.2 %**.

⇒ **The derived-variable inventory is a CORRECTNESS programme, not a coverage programme.** Arts.
4.5.4–4.5.6 matter because PRYZM currently under-grants height on corner and plaza parcels and
diverges from a prescribed method (§0.2) — that is a fidelity defect worth fixing on the merits.
**It is not a way to raise Murcia's score, and presenting it as one would be dishonest.** The
founder's question was worth asking precisely because the answer is *"six more are derivable, and
none of them is worth points here"* — the value is portability to cities where the same variables
gate much larger shares.

---

*Maintainer: UNASSIGNED. Created 2026-08-02. Authority: ADR-0285 · ADR-0287 · C63 §1.5 · L-656 ·
BLOCKER-CLASSIFICATION-STANDARD.*
