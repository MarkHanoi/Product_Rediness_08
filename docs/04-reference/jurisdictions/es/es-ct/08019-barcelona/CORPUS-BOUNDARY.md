# Barcelona (INE 08019) — CORPUS BOUNDARY

> **What is inside PRYZM's verified planning corpus for Barcelona, and what is outside it.**
>
> **Stamp 2026-08-02.** Created under **SIG-4** (founder, 2026-08-02), which directs PRYZM to publish
> exactly three things for clau `22a`: the **municipal framework**, the **quantified delegation**, and
> **this corpus boundary** — and to treat delegated plans as *outside scope unless individually
> analysed*. Signature recorded verbatim in [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) §SIG-4.
>
> **Authority:** the corpus-wide doctrine the founder signed alongside it (Madrid SIG-M2 doctrine
> question; the orchestrator is raising it as an ADR — **cite the ADR from here once it lands, do not
> restate the argument**):
>
> > *"Authoritative publication defines the boundary of knowledge, not necessarily the boundary of
> > reality. Unknown is a valid product state."*
> > *"PRYZM shall dispatch deterministic envelopes only where the applicable zoning geometry is
> > directly supported by authoritative published data. Partial publication does not authorize
> > inference beyond its demonstrated spatial extent."*

---

## Why this file exists, in one sentence

**So that a user can tell a COVERAGE BOUNDARY from a DEFECT.** Barcelona refuses on a large share of
its buildable land. Without this file every one of those refusals reads as "PRYZM is incomplete";
with it, most of them read as "the governing document is a different instrument, and PRYZM does not
hold it" — which is a true statement about the world, not a gap in the product.

---

## 1 — IN SCOPE: the municipal framework

Everything below is **committed to this repo, git-tracked, and re-readable**. This is the whole of
what PRYZM has verified for Barcelona. Nothing outside this list has been read.

| Instrument | What it governs | In repo |
|---|---|---|
| **PGM-1976** *Normes Urbanístiques* (MMAMB re-edition of the 1988 *Text Refós*) | the base zone articles — Arts. 242, 306, 314–351 | [`PGM-NNUU-metropolitana.pdf`](./PGM-NNUU-metropolitana.pdf) |
| **MPGM 02-03-2007**, DOGC núm. 4893 pp. 18336–18339, expedient `2006/025790/B` | Arts. 327.2a / 328.2a — the Barcelona *alçada reguladora* ladders | [`corpus/pdf/DOGC-4893_…_BARCELONA.pdf`](./corpus/pdf/) + the RPUC signed *text d'aprovació definitiva* |
| **Modificació NNUU PGM *edificació aïllada* de Barcelona**, 20-10-2004, DOGC núm. 4277 | Arts. 342 / 343, Barcelona-exclusive | inside the committed PGM volume, printed pp. 177–188 |
| **AMB *Refós de Planejament*** — `qualificacio_refos_3857/MapServer` | the clau polygons (layer 16) and the OV volumetric footprints (layer 17) | live service, queried re-runnably; not a document |

⚠ **A committed document is not an authenticated one.** The PGM volume is a **manually re-typeset
re-edition**, with transcription errors documented *in that same volume* (Arts. 251.3a, 330, 331). It
is primary but not the DOGC original and not Barcelona's own 08019 consolidation. `documentInRepo`
is `true`; *fidelity* is a separate, open question.

## 2 — OUT OF SCOPE: derived planning

**PRYZM holds ZERO derived-planning instruments for Barcelona.** Not one Pla Parcial, PERI, Pla
Especial, PMU, Estudi de Detall or *ordenació de volums* has been retrieved, read or transcribed.

Under SIG-4 this is a **declared scope boundary**, not a backlog:

> *"Treat delegated plans as outside scope unless individually analysed."*

⚠ **"Outside scope" is a REFUSAL, never a silent omission.** Every parcel whose governing instrument
is delegated receives a **cited refusal naming the instrument class and the delegating article**. It
must never fall through to a framework number. That is the specific risk this signature creates, and
it is pinned by test (§5).

## 3 — THE QUANTIFIED DELEGATION — measured, not asserted

Measured **2026-08-02** against the AMB Refós `PLAN` field (`PG` = *pla general*, `PD*` = *pla
derivat*), over the private-buildable denominator of **31,794,683 m²** (24 pure clau codes,
L-656 / L-677). Re-runnable:

```bash
curl -s -G "https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer/16/query" \
  --data-urlencode "where=CODI_INE='08019'" \
  --data-urlencode "groupByFieldsForStatistics=CLAU_URB,PLAN" \
  --data-urlencode 'outStatistics=[{"statisticType":"sum","onStatisticField":"SHAPE_Area","outStatisticFieldName":"area"}]' \
  --data-urlencode "returnGeometry=false" --data-urlencode "f=json"
```

| Governing instrument class | Share of private buildable land |
|---|---:|
| `PD*` — **a derived plan** (outside the corpus) | **70.69 %** |
| `PG` — the general plan (inside the corpus) | **29.31 %** |

**For clau `22a` specifically** — the zone SIG-4 names — a complete census of all **81** polygons:

| | polygons | m² | share of 22a |
|---|---:|---:|---:|
| `PD*` derived plan | 79 | 4,907,691 | **98.92 %** |
| `PG` general plan | 2 | 53,666 | **1.08 %** |

⇒ **15.43 % of Barcelona's entire private buildable land is clau-22a land governed by a derived plan
PRYZM does not hold.** That is the quantified delegation SIG-4 asks to be published, and it replaces
the previous prose estimate of "~2,595 Pla Parcials" with a measured share.

### 3.1 ⚠⚠ THE FINDING THAT IS BIGGER THAN 22a — and it is NOT resolved by this signature

The same census says **`PD*` also covers 68.6 % of clau `13a`, 80.9 % of clau `12` and 37.4 % of
clau `13b`** — the three families on which PRYZM **publishes constructed envelopes** at
`block-constructed` (weight 0.7).

**This is not new, and that is the uncomfortable part.** [`L-590c`](./L-590c-PLA-PARCIAL-REGIME-RESOLVED.md) §7
already recorded it, in these words:

> *"The `*` suffix on `PD*` … is the assimilation marker, and it is telling us every time that the
> clau we read is a **translation, not the governing text**. We have been consuming the translation
> and citing it as the original."* … *"This should become an ADR."*

**The ADR was never written, and the finding never reached a register row.** The founder's doctrine
is now precisely its ratification.

⚠ **WHAT IS AND IS NOT BEING CLAIMED HERE — read this before acting on it.**

- **MEASURED:** for 68.6 % of clau-13a land the AMB Refós records the governing instrument as a
  derived plan.
- **UNKNOWN:** whether that derived plan *displaces* PGM Art. 242.2's *profunditat edificable*
  construction, or merely *assigns the clau* whose article PRYZM then applies correctly. For `22a`
  Art. 350.1 says the Pla Parcial sets the regime, explicitly. **For 13a/13b/12 no article has been
  read that says so, and none has been read that says otherwise.**
- **THEREFORE NOT DONE:** the ENVELOPE axis has **not** been moved. Downgrading 13a on the strength
  of a field whose semantics nobody has read would be an inference beyond the published extent — the
  exact move the doctrine forbids — and Barcelona's own register records **four** separate occasions
  where a gap was ranked before its sign was measured.

⇒ Recorded as `CLOSURE-REGISTER` row **19**, typed `missing-evidence`, and flagged to the
orchestrator as **the highest-value open question in the city**. It is resolved by reading what the
Refós `PLAN` field means — one documentary question, not 2,600.

## 4 — What a user sees, per class of land

| Land | What PRYZM returns | Tier |
|---|---|---|
| `13a` · `13b` · `12`, dissolve succeeds | a **constructed** Art. 242.2 envelope, cited | `block-constructed` |
| `20a/*` ×8 | a **constructed** *edificació aïllada* setback envelope, cited | `estimated-ruleset` |
| `18` with an OV footprint (26.4 %) | the published volumetric footprint, cited (SIG-3) | `estimated-ruleset` |
| `18` without one · `22a` · `22@` · `12b` · bare `20a` · `14a/14b/15/16/17*` · `8a` | a **cited refusal naming the governing article and instrument** | `not-determined` |
| systems · Collserola · parks · port · rail | *"public system — no private buildable envelope applies"* | excluded from the denominator entirely |

**No cell in that table is a fabricated number, and no cell is silence.**

## 5 — How the boundary is enforced in code

| Guarantee | Where |
|---|---|
| a delegated 22a parcel gets a cited refusal, never a framework number | `esBarcelonaZoneClassification.ts` → `barcelonaRegimeUndeterminedRefusal`, reached **before** `barcelonaNoRulePackRefusal` |
| the refusal states the **measured** delegation, not a guess | `BCN_22A_DELEGATION_MEASURED` (`esBarcelonaIndustrial.ts`) |
| the framework's FAR / occupation never enter a numeric envelope field | C58 §1.13.3 — a refused envelope nulls every number |
| `22a` is absent from `packsByZone` **by construction** | `rulepacks/registry.ts` |
| all of the above is pinned | `__tests__/bcnCorpusBoundary.test.ts` |

---

*Authority: SIG-4 (founder, 2026-08-02) · the corpus-wide publication doctrine (ADR in flight — link
it here, do not restate it) · C58 §1.2/§1.13 · C63 §1.5 · L-449 · L-590c · L-656 · L-677.
Siblings: [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) · [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md) ·
[`ENVELOPE.md`](./ENVELOPE.md) · [`RATE.md`](./RATE.md). Maintainer: UNASSIGNED.*
