# LEGISLATION-RATE — Brussels (`21004`) city — structured legislation/data-fill rate

> Feeds C63 Axis 2 (LEGISLATION). Composite master scorecard: [`RATE.md`](./RATE.md). Convention: `../../../_TEMPLATE/NAMING-CONVENTION.md`.

**Headline rate: ~5–10%** (Brussels-Capital regional structured-fill; the highest of Belgium's three regions)

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric + height**)
> **without reading an ordinance text/PDF**. IDENTICAL definition across every jurisdiction so the
> scores are directly comparable. Derived from direct endpoint/schema checks (see `../../findings/`),
> not assumed from Belgium's open-data reputation.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| Paris | ~35% |
| France (national) | ~22% |
| **Belgium (national, blended)** | **~10–14%** |
| **Brussels-Capital** | **~5–10%** |
| Flanders (Antwerp) | ~0–5% |
| Wallonia (Liège) | ~0–2% |

Brussels is the **highest-fill Belgian region** because it is the only one with a region-wide
numeric-leaning baseline text (**RRU Titre I**) — but the number is still low because that text is a
**formula-in-PDF**, not a queryable attribute, and is legally subordinate to a discretionary test.

---

## Why Brussels differs from Flanders/Wallonia

- **Brussels has a region-wide baseline (RRU Titre I).** Flanders routes height through per-RUP
  *voorschriften* (frequently "vrij"/free) and Wallonia through the discretionary *bon aménagement
  des lieux*; Brussels alone has one written region-wide gabarit code to anchor a first `GeometricRule`
  kind against.
- **But the RRU baseline is context-relative and PDF-bound.** RRU Titre I ("Caractéristiques des
  constructions et de leurs abords") expresses gabarit/implantation as `H = P + 3.00 + D` (P = rue
  width, D = parcel depth) — closer to Porto's *moda da cércea* than a lookup. It is not a numeric
  API field, and a **PPAS/RRUZ/PAD precedence check** must run first (local plans override the regional
  default for specific districts).

## Field-by-field breakdown (Brussels-Capital)

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Full (federal) | CADMAP/CadGIS federal WFS (AGDP/SPF Finances) — verified live 2026-07-24 | ~90% |
| Zone/use boundary hit (PRAS) | ✅ Structured | `gis.urban.brussels/geoserver/PERSPECTIVE_FR:Affectations` (bot-blocked direct; cache-confirmed) | ~90% |
| Buildable depth (RRU Titre I Art. 4) | ✅ CONFIRMED + encodable | `depthLimit = min(0.75·parcelDepth, neighbourRule())` — ≤¾ parcel depth + neighbour rule (read verbatim `urbanisme.irisnet.be/pdf/RRU_Titre_1_FR.pdf`); resolver, not a stored number | ~40% (rule confirmed; fill pending resolver + neighbour join) |
| Implantation (RRU Titre I Art. 3) | ✅ Categorical | Front façade at the alignment/building line (NOT metres); on/against shared boundary — encode "alignment" | ~30% |
| Height / gabarit | ⚠️ Contextual — formula UNCONFIRMED | No per-zone table; `H = P + 3 + D` is NOT in the official RRU Titre I → UNCONFIRMED, do NOT encode. Geometry-derivable from UrbIS-3D CityGML (`maxRoofZ − minGroundZ`) | ~10% |
| FAR / plot ratio | ❌ Genuinely absent | No Brussels FAR-equivalent — record `n-a`/`unknown`, NEVER 0 (regulated by affectation + gabarit) | `n-a` |
| CBS+ (Coefficient de Biotope par Surface) | ✅ Structured GIS layer | Brussels ecological-potential indicator (RRU reform) — an adjacent gating layer, not height/FAR | contributes the small non-zero credit |
| Heritage overlay | ⚠️ Register exists; live GIS layer unconfirmed | Direction du Patrimoine culturel / urban.brussels | ~50% |
| Provision-code semantic catalogue | ❌ Does not exist | No Belgian region publishes a Sweden-style Planbestämmelsekatalog | 0% |

## The structural gap

Brussels' low rate is a **legal-design** problem, not a data-completeness one. Its PRAS zone-boundary
coverage is excellent (~90 %), but the height/gabarit number sits in RRU Titre I as a **context-relative
prose formula** subordinate to the discretionary *bon aménagement des lieux* test — which the engine
cannot itself evaluate. Two additional Brussels-specific gates (**CBS+** ecological coefficient and
**TOTEM** life-cycle comparison for demolitions > 1,000 m²) must be tracked as adjacent constraint layers.

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Resolve the Brussels bot-detection block (Belgian-IP / EU deployment) to independently verify PRAS/RRU/RRUZ layers + licence | Prerequisite for all Brussels pack work | Low–Medium |
| Read RRU Titre I verbatim + build the reference-formula gabarit KIND (`H = P + 3.00 + D`) | Converts the PDF formula to computable envelope | High (~20–25 dev-days) |
| Confirm whether the federal CADMAP building sublayer carries a height/storey attribute | If yes: free nationally-consistent building-height source | Low — one GetFeature |
| Wire the PRAS/RRU/RRUZ/PPAS precedence check | Correct instrument selection before any RRU rule | Medium |

**Realistic ceiling** is capped below Sweden/Denmark by the absence of a provision-code semantic
catalogue and the pervasive discretionary test — raising it durably needs a **policy change**, not just
data engineering (`../../findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md` PART D).

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Prior derived from `../../RATE.md` (national blend) +
`../../findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md §B.1`. No numeric RRU value is certified — see
`sources/VERIFICATION.md` (OPEN).*
