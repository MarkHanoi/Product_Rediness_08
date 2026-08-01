# VERIFICATION — Barcelona (es-ct, 08019) — the human sign-off ledger

> **The L-449 gate.** Transcribing an ordinance into a buildability engine is a **legal act**, not an
> engineering one. This file records **who signed what, when, against which document** — and, just as
> importantly, **what each signature does NOT authorise**.
>
> ⚠ This file did not exist until 2026-08-01. The Barcelona ceiling audit found that
> `es-an/14021-cordoba` and `es-md/28079-madrid` each had one and **Barcelona — the pilot — did not**;
> the 13a acceptance existed only as prose in `RISK-REGISTER.md` R1. Signatures below are recorded in
> the shape of the signed `ch/sources/VERIFICATION.md` exemplar.
>
> **Signing a SOURCE ≠ certifying its NUMBERS.** Keep the two gates separate, as the 13a lineage did.

---

## SIG-3 · 2026-08-01 · clau 18 — `BCN_REFOS_OV_CERTIFIED`

| | |
|---|---|
| **Verifier** | Founder (repo owner) |
| **Date** | 2026-08-01 |
| **Axis** | ENVELOPE |
| **Artefact** | `packages/site-parcel-data/src/providers/bcnRefosOVProvider.ts` → `BCN_REFOS_OV_CERTIFIED` |
| **Source** | AMB *Refós de Planejament*, `qualificacio_refos_3857/MapServer` layer **17 `OV_Trames`** — a *transcripció gràfica i alfanumèrica* of approved volumetric orderings |

**The question signed:** *does the AMB Refós `OV_Trames` layer reflect the currently-in-force volumetric
orderings for Barcelona?* PGM **Art. 306** states no envelope — it points at a per-site approved
volumetric ordering — and the AMB publishes those orderings as queryable geometry.

**AUTHORISES:** an `explicit-area` envelope on the **26.4 % of clau-18 land** that carries an OV footprint
**with a parseable storey count**, at confidence `estimated-ruleset`, caveated with the AMB Refós and its
**uncertified vintage**. Expected ENVELOPE-axis gain **+4.68 pp** (56.0 % → ~60.7 %).

**DOES NOT AUTHORISE:**
- the other **73.6 %** of clau-18 land — those keep the **cited Art. 306 refusal**;
- any other clau (the dispatch branch is guarded to clau exactly `'18'`);
- promoting the confidence tier above `estimated-ruleset`;
- treating the metre height as sourced — **`PLANTES` is a STOREY COUNT** (`"B+7"`), converted to metres
  through PGM **Art. 327.2**, and that conversion is cited, not assumed.

**Known limits at signing, accepted:**
- **The layer publishes NO edition date, NO cut-off, NO currency declaration.** The vintage question
  therefore cannot be answered from the service and was signed on the founder's judgement, not on
  evidence from the publisher.
- **`PLANTES` is 100 % populated but only 92.0 % parseable** — 408 of 5,073 polygons carry the literal
  **`"ED"`**, undocumented, no domain, no description. **79 % of that unparseable area sits on clau-18
  land.** ⚠ Its likely meaning (*edificació existent*) would make it *"consult another source"*, **not** a
  compressed storey count — so decoding it may unlock **nothing**. Recorded so the 26.4 % is not
  mistaken for a temporary number.
- Coverage measured over **all 1,282 clau-18 polygons** (lattice sampling in EPSG:25831, reproducing
  `SHAPE_Area` to 0.01 %), corroborated by reverse attribution and 800 live points, 800/800 agreement.

---

## SIG-2 · ✍ SIGNED 2026-08-01 — L-660, Arts. 327.2a / 328.2a (MPGM 2007)

| | |
|---|---|
| **Verifier** | Founder (repo owner) |
| **Date** | 2026-08-01 |
| **Axis** | LEGISLATION / ENVELOPE |
| **Source** | **DOGC núm. 4893, 29-05-2007, pp. 18336–18339** — the BINDING published annex — plus the RPUC-registered signed *Text d'aprovació definitiva*, expedient **`2006/025790/B`**. Both committed at [`../corpus/pdf/`](../corpus/pdf/). |

**APPLIED.** `BCN_ART327_MPGM_2007.applied === true`. The shipped tables now carry the Barcelona
values: **327.2a** 9,00 / 12,35 / 15,70 / 19,05 / 22,40 / 25,75 m · **328.2a** 8,25 / 12,00 / 15,40 /
18,80 m. The superseded metropolitan ladders are retained as `BCN_ART327_BASE_METROPOLITAN_TABLE` /
`BCN_ART328_BASE_METROPOLITAN_TABLE` — **not read by Barcelona's resolver**, kept because they govern
AMB municipalities carrying no modification of these articles.

**Basis:** the annex was retrieved and the compendium transcription confirmed **band-for-band with
zero corrections**. Scope verbatim: *«al terme municipal de Barcelona»* — whole municipality, no
sector, no *àmbit*, **no transitional regime**. Storey minimum **3,05 m unchanged** (stated three
times in the annex); what rises 3,35 m per band is the ladder, not the storey.

**Effect:** band boundaries and storey counts are **unchanged** — the instrument's own key reads
*«En negreta, text afegit o modificat»* and only the *Alçada màxima* column is bold. **No parcel
changes band; every height moves +0,45…+1,95 m** across **44.0 %** of private buildable land
(13a + 13b + 12).

⚠ **Open risk accepted at signing:** supersession is `NOT_VERIFIED / finding: not_found` (L-661) —
1,755 Barcelona instruments enumerated, narrowed to 147 PGM-level post-2007, **0 opened**.
`laterModifications: none` is written nowhere and must not be.
⚠ **Misattribution guard:** Badalona's own instrument (DOGC 5224) states **numerically identical**
values. *A figures-only check cannot tell the two municipalities apart* — this error recurred three
times. **Always verify the municipality, never the numbers.**

The binding text **has now been retrieved**: DOGC **núm. 4893, 29-05-2007**, pp. 18336–18339, plus the
RPUC-registered signed *Text d'aprovació definitiva* — both in [`../corpus/pdf/`](../corpus/pdf/).
Expedient **`2006/025790/B`**. Scope verbatim: *«al terme municipal de Barcelona»*, whole municipality,
no sector or *àmbit* restriction, **no transitional regime**. Storey minimum **3,05 m confirmed
unchanged** (stated three times in the annex).

**What signing would authorise:** replacing the shipped **base** metropolitan tables with the modified
Barcelona ones — `327.2a` 8,55/11,60/14,65/17,70/20,75/23,80 → **9,00/12,35/15,70/19,05/22,40/25,75**;
`328.2a` 7,55/10,60/13,65/16,70 → **8,25/12,00/15,40/18,80**. **Band boundaries and storey counts are
unchanged** (only the *Alçada màxima* column is bold in the instrument's own key), so **no parcel changes
band — every height changes by +0,45…+1,95 m** across **44.0 %** of private buildable land (13a+13b+12).

⚠ **The one open risk:** supersession is recorded as **`NOT_VERIFIED / finding: not_found`** (L-661).
**1,755** Barcelona instruments were enumerated from the RPUC and narrowed to **147** PGM-level
post-2007; **0 of 147 were opened**. `laterModifications: none` is written nowhere, and must not be.

---

## SIG-1 · 2026-07-20, re-exercised 2026-07-21 · clau 13a source acceptance

Founder accepted the current consolidated PGM refós (RPUC / AMB NUMAMB) as the source for the 13a pack.
**Re-exercised 2026-07-21** after L-526 found the original citation both **stale** and **anachronistic**
(it named the AMB, which did not exist until 21-07-2011). **Re-citing corrected the ATTRIBUTION, not the
confidence tier** — the pack still ships `estimated-ruleset`, because the per-parcel figures remain
uncertified against the MUC/RPUC *fitxa urbanística*. Recorded in `esBarcelonaEnsanche.ts` and
`RISK-REGISTER.md` R1.

---

## Standing caveat on every signature above

**`honestyOk` is launch-blocking; a completion percentage is not.** A signature authorises PRYZM to
*publish* a number at a *stated confidence*; it never converts an estimate into an authoritative
determination, and it never makes PRYZM's output a permit.

*Maintainer: UNASSIGNED. Authority: C58 §1.2/§1.4/§1.6 · C63 · ADR-0270 · ADR-0271 · L-449.*
