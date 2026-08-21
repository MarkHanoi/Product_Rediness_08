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

## SIG-5 · ✍ **RECORDED 2026-08-21** · clau 18 OV — tier `block-constructed` for table-exact determinations

| | |
|---|---|
| **Verifier** | Founder (repo owner) — live demo-session instruction, recorded by lane BCN1 (L-1660) |
| **Date** | 2026-08-21 |
| **Axis** | ENVELOPE |
| **Artefact** | `ZoningRulesEngine.ts` §L-572 stamp + `explicitAreaAuthority: 'published-site-ordering'` on the §BCN-CLAU18-OV dispatch (`siteDispatch.ts`) |
| **Source** | The SAME source SIG-3 signed — AMB *Refós de Planejament* `OV_Trames` — no new source is accepted here |

**THE INSTRUCTION, VERBATIM (founder, demo session 2026-08-21):** *«for my demo - check this
cadastral parcel specifically in barcelona - it says estimated - but i am sure the data exists -
read jurisdictions etc and make this parcel sound for the demo»* (parcel 3634515DF3833D, CL Perelló
60 — resolving clau 18 OV, PLANTES B+4, gate CERTIFIED, yet badged "Estimated" with a "Default rule
pack" caption). Read together with the standing 2026-08-03 gate-publication authorisation ("flip
gates where ONLY the gate blocks; does not supersede missing legal authority").

**WHY THIS IS A TIER CORRECTION, NOT A PROMOTION-BY-RENAMING:** SIG-3 pinned the tier at
`estimated-ruleset` while its stated premise was an *uncertified vintage* — a premise SIG-3 itself
then closed by being signed. The ladder's own definition (`ProvenanceFlags.ts`) places "real inputs
+ accepted rule + constructed geometry — NOT an official municipal certificate" at
`block-constructed`; the OV determination (published per-site footprint + published PLANTES +
cited Art. 327.2 conversion + parcel ∩ footprint clip) is that definition. The card meanwhile
rendered three false statements ("Estimated", "Default rule pack — real DK/ES zoning coming",
"vintage UNCERTIFIED") about a determination whose every input is real and cited.

**AUTHORISES:** rendering the clau-18 OV determination at **`block-constructed`** — ONLY where the
OV footprint clip succeeded AND the PLANTES→metres conversion is **table-exact** under the
Art. 327.2 storey table. The Refós re-edition caveat and the floors→metres-convention caveat stay
in the caveats/provenance rows (mirroring R1's treatment of the 13a construction).

**DOES NOT AUTHORISE:**
- `structured` or `authoritative` — the metre height is still a convention applied to a floor
  count, and the Refós is still a re-edition (`block-constructed` < `structured` is load-bearing);
- the EXTRAPOLATED conversion basis (floor count beyond the table's range) — stays
  `estimated-ruleset`, with the height row honestly `estimated`;
- any change to the 73.6 % refusal share, to other claus, or to the PACK seed
  (`defaultConfidence: 'estimated-ruleset'` — a pack cannot self-certify);
- removing the vintage caveat from the rows.

**Reversal:** one line — stop passing `explicitAreaAuthority` on the §BCN-CLAU18-OV dispatch.

---

## SIG-4 · ✍ **SIGNED 2026-08-02** · clau 22a — publish framework, exclude delegated plans

| | |
|---|---|
| **Verifier** | Founder (repo owner) |
| **Date** | 2026-08-02 |
| **Axis** | ENVELOPE / LEGISLATION |
| **Artefact** | `BCN_22A_DELEGATION_MEASURED` (`rulepacks/esBarcelonaIndustrial.ts`) + [`../CORPUS-BOUNDARY.md`](../CORPUS-BOUNDARY.md) |
| **Source** | PGM-1976 NNUU Arts. 348–351 (committed, [`../PGM-NNUU-metropolitana.pdf`](../PGM-NNUU-metropolitana.pdf)) × the AMB *Refós de Planejament* `PLAN` field, complete 81-polygon census 2026-08-02 |

**THE SIGNATURE, VERBATIM:**

> **22a — Decision: SIGN.**
> Do not require collection of ~2,600 partial plans.
> Publish: **municipal framework · quantified delegation · corpus boundary.**
> Treat delegated plans as **outside scope unless individually analysed.**

**THE DOCTRINE IT APPLIES** — signed corpus-wide alongside it (Madrid SIG-M2 doctrine question; being
raised as an ADR by the orchestrator. ⚠ **Cite the ADR from here when it lands; do not re-argue it,
and do not author a second version.**):

> *"Authoritative publication defines the boundary of knowledge, not necessarily the boundary of
> reality. Unknown is a valid product state."*
> *"PRYZM shall dispatch deterministic envelopes only where the applicable zoning geometry is directly
> supported by authoritative published data. Partial publication does not authorize inference beyond
> its demonstrated spatial extent."*

**THE QUESTION SIGNED:** *must PRYZM exhaust the derived-planning corpus before publishing anything
on clau 22a?* **Answered NO.** The municipal framework is published and authoritative; the ~2,600
derived instruments are not in the corpus; therefore the framework publishes and the delegated land
**refuses with a citation**.

**AUTHORISES** — publishing exactly three things, and only these three:
1. **The municipal framework** — Art. 350's regime-neutral limits (FAR 2 m²st/m²s, unconditional
   across Arts. 350.1.1r/350.1.2n/350.2.a; occupation 90 % *with its condition attached*), as prose
   under a citation. Already shipped as `BCN_22A_REGIME_NEUTRAL_LIMITS`.
2. **The quantified delegation** — **98.92 %** of Barcelona's clau-22a land (79 of 81 polygons,
   4,907,691 m², complete census, 2026-08-02) recorded by the AMB Refós as governed by a *pla
   derivat*; **1.08 %** by the *pla general*. ⇒ **15.43 % of the city's entire private buildable
   land.** Shipped as `BCN_22A_DELEGATION_MEASURED`.
3. **The corpus boundary** — [`../CORPUS-BOUNDARY.md`](../CORPUS-BOUNDARY.md), stating what is in
   verified scope and what is out, so a user can distinguish a coverage boundary from a defect.

**DOES NOT AUTHORISE:**
- ⚠⚠ **any envelope on delegated land.** Scoping the delegation OUT is not the same as resolving it.
  `not-determined` at weight 0.0 remains the correct ENVELOPE-axis score for it (C63 §1.5 / L-656: a
  cited refusal is a correct answer, and a correct answer is not an envelope). **The axis did not
  move: 36.5 % before this signature and 36.5 % after** — verified by re-running the scorecard.
- **any silent omission.** A delegated parcel must receive a cited refusal *naming the instrument
  class and the delegating article*, never a fall-through to a framework number. Pinned by
  `__tests__/bcnCorpusBoundary.test.ts`.
- writing the framework FAR or occupation into a numeric `BuildableEnvelope` field (C58 §1.13.3 — the
  generators and `storeyCap` read those and will extrude one).
- promoting any tier, or extending the finding to `22@`, `18` or any other clau.

**KNOWN LIMITS AT SIGNING, ACCEPTED:**
- ⚠ **The signature's title and its text name different claus.** The coordinating instruction was
  headed *"the 22@ decision"*; the signed text says **"22a"** and names *"~2,600 partial plans"*,
  which is unambiguously **22a**'s corpus (Art. 350.1) — `22@` is a 2.06 % zone closed separately by
  **DEC-1** under Art. 8.1 of the MPGM 22@. **Recorded as signed (22a), and the discrepancy is
  flagged rather than resolved silently.** If `22@` was also intended, that needs its own signature.
- ⚠ **The 98.92 % is a CITY-WIDE statistic, not a per-parcel routing key.** PRYZM's live zone read is
  the Generalitat MUC, which carries **no** `PLAN` field, so the engine cannot tell which 22a parcel
  is in the 1.08 %. The card states the split; it does not branch on it.
- ⚠ **`PD*` semantics are UNREAD, and the exposure is not limited to 22a.** The same census puts
  `PD*` over **68.6 % of clau 13a**, **80.9 % of clau 12** and **37.4 % of 13b** — the three families
  PRYZM publishes constructed envelopes on. L-590c §7 already called the `*` an *assimilation
  marker* meaning *"the clau we read is a translation, not the governing text"* and asked for an ADR
  that was never written. **This signature does not cover that**, nothing has been downgraded on the
  strength of it, and it is open as `CLOSURE-REGISTER` row **19** (`missing-evidence`).

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
- promoting the confidence tier above `estimated-ruleset` — ⚠ **narrowly superseded by SIG-5
  (2026-08-21)**: `block-constructed` is authorised for table-exact determinations only; everything
  else in this bullet stands;
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
