# Córdoba (INE 14021) — Raster Zone Classifier, Safe-Subset Implementation Pass, 2026-08-05

> **Task type: IMPLEMENTATION + MEASUREMENT. Nothing committed, nothing deployed.** New code is
> uncommitted in the working tree for human review. `CORDOBA_ENVELOPE_VERIFIED` was read-only
> throughout and is untouched. The new capability's own gate ships **`false`**, and its committed
> record set ships **empty**, so this pass changes production behaviour by exactly nothing —
> pinned by test, not asserted by inspection.
>
> Every number below was computed live this session against real `coaco:ordenanzas`,
> `coaco:hojas_cus` and Catastro INSPIRE CP responses, and against the real corpus rasters. Where a
> figure is carried from `RASTER-PARCEL-ZONING-FEASIBILITY-2026-08-05.md` it is cited as such.

---

## Executive summary

Three things were asked for in sequence: (1) build a colour classifier restricted to
`Manzana Cerrada` / `Ordenación Abierta` / `Unifamiliar Adosada`; (2) then, on a mid-task redirect,
put **OCR of the printed zone-code text in front of it as the primary signal**; (3) then make the
two signals corroborate and refuse on conflict.

**Measured outcome:**

| Question | Answer |
|---|---|
| Do the CUS sheets print legible zone-code text inside the coloured polygons? | **No — not ordenanza codes.** The bold black labels are *planning-instrument* and *dotacional-use* codes (PERI, PA, PP, SUP, SG, SGEL, ED, SS-n, MA-n, E, S, D). §3 |
| Does OCR extract an ordenanza zone code from any sheet? | **Zero, on six sheets, 969 detected text boxes.** §3.2 |
| Is the subzone recoverable at all? | **No.** It is printed as a bare rotated numeral; a real OCR engine detects none of them, and the commonest digit `1` is indistinguishable from map linework. §3.3 |
| Is the *family* recoverable? | **Yes, for MC and OA** — reproduced independently this pass. §4 |
| Is UAD safe, as the brief proposed? | **No — dropped.** Its nearest collider was never observed co-present with it. §2 |
| Can a family bind a number? | **No.** OA-1 vs OA-2 is FAR 1.4 vs 1.6; MC's footprint is structurally unresolved. §5 |
| Deploy-safety verdict | **Do not sign the gate. Ship the seam, not the data.** §8 |

**The one-sentence version:** the pipeline can honestly tell a user *which ordenanza family* their
land reads as, and that is worth having as a better-worded refusal — but it cannot tell them the
subzone, the subzone is what carries every number, and the only land it can reach is land where its
accuracy has never been and cannot be measured.

---

## 1. What was built

| File | Status | What it is |
|---|---|---|
| `packages/site-parcel-data/src/providers/resolveCordobaRasterClassifiedZone.ts` | NEW | The resolver. Same shape as `resolveCordobaTracedZone.ts`: never throws, typed refusals, static JSON data load, own OTel span, own honesty gate. |
| `packages/site-parcel-data/src/providers/data/cordobaRasterClassifiedZones.json` | NEW | The record store. **Ships `[]`** — see §7. |
| `packages/site-parcel-data/src/index.ts` | EDIT | Barrel export block for the above. |
| `apps/editor/src/ui/site/siteDispatch.ts` | EDIT | New `applyCordobaRasterClassifiedZoneThenFallback`, chained into `applyCordobaTracedZoneThenFallback`'s three "no traced answer" exits. |
| `packages/site-parcel-data/__tests__/cordobaRasterClassifiedZone.test.ts` | NEW | 34 resolver tests. |
| `apps/editor/__tests__/cordobaRasterClassifiedSiteDispatch.test.ts` | NEW | 6 gate-CLOSED dispatch tests (the no-op proof). |
| `apps/editor/__tests__/cordobaRasterClassifiedVerifiedSiteDispatch.test.ts` | NEW | 7 gate-OPEN dispatch tests (the "still refuses" proof). |

The source hierarchy this slots into, weakest last:

```
coaco:ordenanzas WFS   >   PRYZM hand-trace   >   THIS pipeline        >   refusal
(published geometry)       (a human read the      (machine-derived,
                            scanned map)           nobody looked at it)
CORDOBA_ENVELOPE_          CORDOBA_TRACED_        CORDOBA_RASTER_CLASSIFIED_
VERIFIED = true            ZONES_VERIFIED = false ZONES_VERIFIED = false
(signed: OCR of the        (unsigned: traced      (unsigned: machine-classified
 NUMBER tables)             GEOMETRY)              zone FAMILIES)
```

Three claims, three failure modes, three independently owned gates. The new module reads neither of
the other two flags, and its header says so in the same terms `resolveCordobaTracedZone.ts` uses.

---

## 2. ⭐ The safe set shrank from three families to two — UAD is dropped

The brief scoped this to `MC`, `OA`, `UAD`, with a standing instruction: *"if you find ANY reason
during implementation that even one of these 3 is less safe than the report suggests (e.g. a
confusion pair with a class not in this safe set that the report didn't fully rule out for these
specific 3), drop that one from scope and say so."*

That case is UAD, and it is not a judgement call — it is the feasibility study's own §12.4 rule
applied to its own data.

### 2.1 The governing rule, restated

§12.4 established that **per-class precision is not a property of a class; it is a property of
(class × the classes co-present on the sheet).** Its worked proof is `Colonia Tradicional Popular`:
certified at 100 % precision on CUS41W and CUS34W, put on the safe list on that basis, then measured
at **86.3 %** on CUS25W — because its collider `Unifamiliar Adosada` is *absent from CUS41W*. All 31
of its false positives were that one confusion. §12.6's resulting rule: a class may be emitted only
if every class within Chebyshev ~80 of its swatch either is absent from that sheet, or has been
measured against it and clears the bar.

### 2.2 The collider table, recomputed this pass from the §3.1 legend RGBs

| family | colliders within Chebyshev 90 | co-present on a validated sheet? | measured precision there |
|---|---|---|---|
| **Manzana Cerrada** | `Prot. Tipológica / Campo de la Verdad` **58**, `Uso Comercial` **70**, `Plurifamiliar aislada` **83** | ✅ PT-CV has ground truth on CUS34W; Comercial on CUS25W + CUS41W | **99.2 %** on CUS34W (its only sub-100 sheet — the collision is real, measured, small), 100 % on the other four |
| **Ordenación Abierta** | `Elemento protegido` **42** — the tightest pair in the entire legend, and its *only* collider under 90 | ✅ EP has 53 ground-truth parcels on CUS41W | **100 %** — and its errors run the safe direction (OA truth → predicted EP = recall loss, never a false OA) |
| **Unifamiliar Adosada** | `Unifamiliar Aislada` **77**, `Colonia Trad. Popular` **84** | ⛔ **No.** `Unifamiliar Aislada` appears in the *entire* COACo vectorised corpus **exactly once** — 1 polygon, 0.003 km² (live-counted this pass, §2.3) — and never on a sheet where UAD was scored | 100 % on two sheets, **with its nearest collider absent** |

### 2.3 Why that is disqualifying, not merely incomplete

Live count of every `coaco:ordenanzas` feature (453 polygons, whole vectorised pilot), keyed on the
authoritative `link` field rather than the sparsely-populated `et` field:

```
Manzana Cerrada        MC-2 201   MC-4 6   MC-3 4   MC-1 1   MC-unspecified 14
Ordenacion Abierta     OA-1 43
Unifamiliar Adosada    UAD-1 14   UAD-3 8
Unifamiliar Aislada    UAS-1 1        <-- UAD's nearest collider, citywide
Colonia Trad. Popular  CTP-1 99
```

UAD's situation is structurally **identical** to CTP's before CUS25W falsified it: a 100 % result on
two sheets, taken at a swatch separation (77) inside the same band as the pair that empirically
produced 31 false positives (74–84), with the collider absent. CTP's 100 % was, in §12.4's words,
"never a property of CTP — it was a property of CUS41W's class composition". There is no evidence
that UAD's is anything else, and the 43 unvectorised sheets are exactly the peripheral, detached-
housing land where `Unifamiliar Aislada` would be expected to appear.

**UAD is therefore not "measured unsafe" — it is unmeasured, and unmeasured is not safe.** It is
excluded from `CORDOBA_RASTER_SAFE_ZONE_FAMILIES`, and a test pins that a UAD record refuses.

---

## 3. ⭐ The OCR redirect, tested for real — and not supported by the evidence

The mid-task redirect was based on a real visual observation: bold black character labels sit inside
the coloured polygons on CUS41W (`E`, `E*`, `S`, `D`, `I` were named). That observation is correct.
The measurement is that those labels are **not ordenanza zone codes**, and that the thing which
*would* be useful — the subzone digit — is not machine-recoverable.

### 3.1 What the labels actually are

Read directly off the raster at 4–8× zoom:

- **Yellow / grey polygons** carry `E`, `E*`, `S`, `D` — these are **USOS DOTACIONALES** (equipment,
  services, sports). Yellow is not in the *ZONAS DE ORDENANZA* legend at all; §8e of the feasibility
  study already accounted for these as "other legend blocks". They are a useful *negative* signal
  (a parcel labelled `E` is equipment, not an ordenanza zone), not a zone code.
- **Horizontal multi-character labels** — `SS-11`, `S-12`, `ED`, `PERI`, `PA`, `PP.N-2`, `SUP-9`,
  `MA-4`, `B-224` — are **planning instruments and sistemas**: PERI/PA/PP/SUP are development-plan
  identifiers, SG/SGEL/SGV are sistemas generales. A completely different classification axis from
  the ordenanza.
- **Inside an ordenanza polygon**, the only label is a **bare bold numeral** — the subzone digit,
  printed at the block's own rotation. Confirmed visually: the salmon (`Manzana Cerrada`) blocks at
  native px (1280–1420, 610–700) each carry a legible rotated `2` → MC-2, matching COACo's
  `link=O_MC2.pdf` for that land. Red (`Ordenación Abierta`) polygons carry `1` → OA-1.
- **Many ordenanza polygons carry no label at all.** The periwinkle `Colonia Tradicional Popular`
  blocks at (1230–1420, 700–900) — roughly 15 blocks — carry none.

### 3.2 What a real OCR engine extracts

`rapidocr-onnxruntime` (installed this session; no `tesseract` binary is available on this machine),
run at 2× upscale over six full sheets including the peripheral/sparse ones the redirect asked for:

| sheet | text boxes found | **ordenanza-zone-code-shaped strings** |
|---|---:|---:|
| CUS41W | 177 | **0** |
| CUS25W | 167 | **0** |
| CUS46W (the sparse, hard sheet §12.5 flagged) | 160 | **0** |
| CUS12W (peripheral) | 171 | **0** |
| CUS30W (peripheral) | 151 | **0** |
| CUS08W (peripheral) | 160 | **0** |
| **total** | **986** | **0** |

Every hit is a planning-instrument label, a legend-panel caption, or a UTM grid tick. And the
engine garbles even those: `PERI` → `PERL`, `S-12` → `$S-12` / `5-12`, `Protegido` → `Protegldo`,
`Ordenanzas` → `Ordananzos`.

⚠ **This is worse than a null result — it is an active hazard.** The strings OCR *does* return are
plausibly code-shaped: `MA-4`, `MA-2`, `MA-5`, `LE-2`, `B-6`, `PP.N-2`. `MA-2` is one character from
`MC-2`. The redirect's proposed safety check — "cross-reference the extracted code against
`esCordobaPGOU2001.ts`'s known vocabulary" — is exactly the right instinct and is implemented
(`familyOfZoneLabel`), but on this sheet series it would be a guard with nothing legitimate ever
passing through it and a steady stream of near-misses arriving at it.

### 3.3 Why the subzone digit is not recoverable

Targeted tests, in order of increasing generosity to the OCR:

1. **Raw colour crop, 4× and 8× upscale**, over the salmon MC blocks where a human reads four clear
   `2`s: **0 text boxes.**
2. **Binarised achromatic ink mask** (dark + near-neutral, the study's §2.1 attempt-2 metric),
   6× upscale, all four cardinal rotations: **0 text boxes.** The mask itself was verified visually
   to contain all four `2` glyphs cleanly — so the input was good and the detector simply does not
   fire on isolated single characters at arbitrary rotation. That is a known property of scene-text
   detectors: they need multi-character text lines.
3. **Geometric glyph detection** (connected components of the ink mask, filtered to a printed-
   character size/solidity envelope) — the right tool, and it *does* find the glyphs. But:
   - It finds **1 224 candidates on CUS41W**, and a random sample of 120, inspected visually, is
     roughly half genuine characters and half linework fragments.
   - The genuine characters are overwhelmingly from **street names and instrument codes**, not
     subzone digits — the sample contains `UNIDEL`, `RE`, `SUE`, `NT`, `EF`, `S-S-S`.
   - Taking the largest ink component inside each polygon, MC-2 polygons yield a legible `2` only a
     minority of the time; the rest are `05`, `UEL`, `DN`, `S`, `O`, `6`, `9` and linework.
   - **OA-1 polygons yield nothing legible at all.** The digit `1` is a bare vertical stroke,
     typographically indistinguishable from map linework at ~14 px.
4. **Label coverage is partial regardless.** Fraction of polygons containing *any* glyph candidate
   (noise included, so an upper bound): `OA-1` **37 %**, `MC-2` **58 %**, `Uso Comercial` **0 %**.

### 3.4 And there is no discriminative ground truth to validate a digit reader against

The only subzone ground truth available is COACo's `link` field, and within the vectorised pilot it
is nearly degenerate: **`Ordenación Abierta` is 100 % OA-1 (43/43)** and **`Manzana Cerrada` is 89 %
MC-2 (201/226)**. A classifier that ignored the image and always answered "1" for OA and "2" for MC
would score 100 % and 89 %. There is no sheet on which a subzone reader could be shown to work.

### 3.5 Conclusion on the redirect

Per the redirect's own instruction #4 — *"if OCR does NOT work reliably in your actual testing …
say so honestly and fall back to your original 3-class colour-only plan; don't force OCR success"* —
**it does not work, and I have not forced it.** The implementation falls back to colour, restricted
further to two families.

What *is* kept from the redirect, because it costs nothing and is right:

- `evidence.ocrZoneLabel` exists on every record and is **`null`** on all of them, with the measured
  reason recorded in the field's own docstring.
- The **corroboration rule is implemented and tested**, not merely described: if a record ever
  carries both a colour family and an OCR label, they must agree or the parcel refuses with
  `evidence-conflict`. An OCR string outside the pack vocabulary also refuses — a misread is not
  evidence of a new zone. Three tests cover agree / disagree / out-of-vocabulary.
- So the decision tree in the redirect's item 3 is implemented exactly, and on this sheet series it
  simply never takes the OCR branch.

---

## 4. Reproducing the study's numbers with this implementation

The brief required running the implementation rather than re-asserting the study's figures. The
georeferencing and classification were rebuilt from the study's prose (its prototype scripts were
session-scoped and did not survive) and re-measured against live services.

### 4.1 Georeferencing — reproduced exactly

Frame detection (dark row/column density maximum inside the paper margin) + `coaco:hojas_cus`
footprint snapped to the CUS41W anchor grid + the ED50 → ETRS89 datum shift:

| sheet | frame detected this pass | frame published in the study | match |
|---|---|---|---|
| CUS41W | `(36, 1841, 16, 1170)` | `(36, 1841, 16, 1170)` (§2.4, manually calibrated) | ✅ **exact** |
| CUS34W | `(24, 1829, 54, 1172)` | `(24…1829, 54…1172)` (§2.3, automated) | ✅ **exact** |

All six `hojas_cus` footprints snap to a clean multiple of 1800 × 1150 m from the CUS41W anchor
(offsets 0.5–6.8 m), confirming §12.1. The layer's labelling defect is reproduced too: it returns
**8 features for 6 named sheets, with three footprints all labelled `CUS25W`**.

Cross-correlation residual against COACo (COACo used only to *measure*, never to fit — so the
parcel scoring below remains a genuine held-out test):

```
CUS41W    Elemento protegido +3/+3   CTP +3/+5   Manzana Cerrada +2/+3
          Ordenacion Abierta +2/+4   Uso Comercial +1/+2
```

**+1 … +5 px**, reproducing §2.2's corrected residual table (+1 … +5 px) family for family.

> **One honest deviation.** My frame detector places CUS25W's left neat-line at x=59 where the sheet
> wants ~37, leaving a systematic −5 … −16 px x-residual on that sheet, and mis-detects CUS46W's
> bottom edge (MY 0.941 vs ~0.996). §12.1 records that CUS46W broke the study's own first frame
> detector too. **This matters for production**: the per-sheet georeference is not reliably automatic
> at the tolerance this pipeline needs, on at least 2 of 6 sheets, and on the 43 unvectorised sheets
> there is no COACo layer to notice it. §2.2/§8f's warning that a bad transform produces a
> "plausible-looking, internally-consistent, entirely wrong result" applies directly.

### 4.2 Parcel-level classification vs the held-back COACo vector

Real Catastro parcels fetched live and classified from the raster alone; COACo held back and used
only to score. Fetch health matches §12.0 exactly — **CUS41W: 190 COACo polygons, 3 422 parcels,
60/60 tiles, 0 failures; CUS25W: 90 polygons, 1 610 parcels, 60/60 tiles, 0 failures.**

| metric | study (§12.3) | **this pass** | verdict |
|---|---:|---:|---|
| CUS41W parcel accuracy (ungated) | 87.4 % | **87.7 %** | ✅ |
| CUS25W parcel accuracy (ungated) | 94.2 % | **93.1 %** | ✅ |
| CUS41W scorable / abstained | 3 331 / 236 | **3 068 / 245** | ✅ same order |
| CUS25W scorable / abstained | 830 / 26 | **820 / 36** | ✅ |

**Per-class precision — the number the safe set is built from:**

| class | CUS41W | CUS25W | pooled | study pooled | verdict |
|---|---:|---:|---:|---:|---|
| **Manzana Cerrada** | **100.0 %** | **100.0 %** | **100.0 %** | 99.8 % | ✅ reproduces |
| **Ordenación Abierta** | **100.0 %** | **100.0 %** | **100.0 %** | 100.0 % | ✅ reproduces |
| Unifamiliar Adosada | *(absent)* | 100.0 % | 100.0 % | 100.0 % | ⚠ see below |
| Colonia Trad. Popular | 100.0 % | **90.9 %** | 99.1 % | 98.8 % | ✅ **the §12.4 drop reproduces** |
| Plurifamiliar aislada | 88.9 % | 100.0 % | 95.7 % | 95.7 % | ✅ exact |
| Elemento protegido | 65.4 % | FP-only(1) | 64.6 % | 61.7 % | ⛔ stably bad |
| Uso Comercial | 20.7 % | 3.4 % | **19.3 %** | 23.4 % | ⛔ stably bad |
| Uso Industrial | 1.8 % | FP-only(6) | **1.6 %** | 0.9 % | ⛔ stably bad |
| CTP1-Campo de la Verdad | FP-only(6) | FP-only(1) | 0 % | 68.9 % | ⛔ FP-only mode reproduces |

**Everything the safe set depends on reproduces independently.** MC and OA are at 100 % precision on
both sheets. The three stably-bad classes are stably bad. And §12.4's decisive finding reproduces in
its own right: **`Colonia Tradicional Popular` scores 100 % on CUS41W and drops to 90.9 % on
CUS25W** — the sheet where its collider `Unifamiliar Adosada` is present with 291 ground-truth
parcels. Precision really is a property of (class × co-present classes).

⚠ **And the same measurement is why UAD is dropped.** UAD scores 100 % here — on CUS25W, where its
own nearest collider `Unifamiliar Aislada` has **zero ground-truth parcels** (it does not appear as
a row on either sheet). UAD's 100 % is measured under exactly the condition that made CTP's 100 %
worthless. See §2.



### 4.3 The confusion-pair table §12.6 asked for

§12.6's own recommended next step was "build the confusion-pair table from the legend (10 classes,
45 pairs, computable offline with no new data)". Done — it is §2.2 above, and it is what removed UAD
from the safe set. Recomputed independently from the §3.1 legend RGBs; the pairs the study flagged
(`EP ↔ OA` 42, `Comercial ↔ Industrial` 49, `PT-CV ↔ MC` 58, `CTP ↔ Comercial` 59) all reproduce.

---

## 5. ⭐ Subzone-level classification is not achievable — and that removes the numeric value

The brief asked directly whether the classifier can distinguish OA-1 vs OA-2 and UAD-1/2/3, and
whether the pack has a family-level fallback if not. Answers:

**It cannot, at any level.** The *ZONAS DE ORDENANZA* legend carries **one swatch per family**. There
is no colour difference between OA-1 and OA-2 to detect. The subzone is carried only by the printed
digit, which §3.3 measures as unrecoverable.

**The pack has no family-level fallback, and should not get one.** `CORDOBA_PGOU2001_ZONE_CODES`
contains only fully-qualified codes (`OA-1`, `OA-2`, `UAD-1…3`, `MC-1…4`, …). A bare `OA` matches
nothing, so `computeBuildableEnvelope` would refuse — which is the correct behaviour and is why the
new dispatcher branch never calls it at all.

**The subzones are materially different**, so guessing one is not a small error:

| | FAR | coverage | front setback | rear |
|---|---:|---:|---:|---:|
| OA-1 | 1.4 | 0.40 | `null` (alignment) | 10.5 m |
| OA-2 | **1.6** | 0.40 | **0** | 10.5 m |
| UAD-1 | 1.0 | 0.60 | 4 m | 5 m |
| UAD-2 | **0.7** | **0.40** | 5 m | 6 m |
| UAD-3 | 1.0 | 0.60 | **0** | 5 m |

Picking OA-1 when the answer is OA-2 understates buildable floor area by 12.5 %; picking UAD-1 when
the answer is UAD-2 **overstates** it by 43 %. On real land, for a real user, with no signal
distinguishing them. That is precisely the
[[envelope-solid-overstates-partial-data]] failure — an UNKNOWN constraint rendered as a bounded one.

**Therefore the resolver resolves a FAMILY and every record carries `subzoneResolved: false`**, a
record claiming otherwise is rejected as `malformed-record`, and the dispatcher branch contains no
call to `computeBuildableEnvelope` by construction.

### 5.1 What MC produces — confirmed by test, as the brief required

MC's footprint is separately and already unresolved (`CORDOBA_MC_FONDO_UNRESOLVED_RING`), unrelated
to this classifier. Confirmed by the gate-open test suite: a parcel classified MC dispatches a
**refusal that names Manzana Cerrada**, with `status: 'none'`, `maxHeight_m`, `maxFloors`,
`buildableArea_m2` and `buildableRing` all null, `legallyGrounded: false`, and a `knownFacts` entry
reading `SUBZONE: NOT determined`. It never attempts a number MC cannot honestly give.

**OA and UAD produce the same outcome**, for the different reason above — the family cannot select
the subzone whose parameters the pack holds. So contrary to the brief's expectation that "OA/UAD can
compute a REAL buildable number", **no family this pipeline can emit produces a number.** The entire
deliverable value is a more specific refusal.

---

## 6. The provenance record — measured quantities only

Per the follow-up instruction "no synthetic confidence numbers", the record carries no aggregate
confidence float. The study's own `classification_confidence` was rejected on its own evidence:
§4 measured errors at confidence **1.000**; §12.3 found that recurs on **every** sheet at 25–41 % of
each sheet's errors (35.2 % pooled, 171 of 486) and that gating on the score is **non-monotonic** —
on CUS26W a 0.95 threshold scores **80.0 %** against **89.4 %** ungated while discarding 85 % of
answers. A number that looks like a safety mechanism and is not one is worse than no number.

```jsonc
{
  "zoneFamily": "MC",                       // the closed safe set: MC | OA
  "refcat": "3632807UG4933S",               // the Catastro parcel the label is snapped to
  "ring": [ /* WGS84 [lon,lat] */ ],
  "sourceSheet": "CUS41W",
  "classifiedDate": "2026-08-05",
  "evidence": {
    "method": "raster_colour_classification",
    "sourceCrs": "EPSG:23030",              // ⭐ MANDATORY — ED50. Without it the record is
                                            //    unreproducible and silently 234 m wrong (§2.2)
    "classifiedPixels": 503,                // measured — non-rejected voting pixels
    "winningPixels": 376,                   // measured — votes for the winner
    "rejectedPixels": 261,                  // measured — linework / near-white / off-palette
    "nearestLegendChebyshev": 12,           // measured — distance to the winning legend swatch
    "runnerUpFamily": null,                 // measured — names the real collision risk, or null
    "georefResidualPx": 3,                  // measured per sheet
    "ocrZoneLabel": null,                   // measured: ALWAYS null on this series (§3.2)
    "subzoneResolved": false,               // structural (§5)
    "derived": true,
    "official": false
  },
  "provenance": "…machine classification of a scanned sheet. NOT municipal data…"
}
```

On the confidence-tier vocabulary: the existing `pipeline-extracted-unverified` tier
(`packages/schemas/src/site/zoning/ProvenanceFlags.ts`) is the right and existing home for anything
this path ever feeds — it is documented as a permanent tier strictly *below* `estimated-ruleset` that
never silently graduates. No new tier was invented. It is not applied to an envelope today because
this path emits no envelope.

---

## 7. ⭐ Why the record store ships EMPTY — the disjointness finding

This is the single most important structural result of the pass, and it was not anticipated by the
brief or the feasibility study.

**Measured, live: all 453 COACo ground-truth polygons lie inside the pilot bbox. Every one.**
Reprojecting each polygon's centroid to WGS84 and testing against `CORDOBA_BBOX`:

```
in pilot bbox (isInCordoba === true):   453
OUTSIDE pilot bbox:                       0
```

The dispatcher routes any point where `isInCordoba(lat, lon)` is true to
`applyCordobaZoningThenFallback` — the **live COACo WFS path** — and returns before the traced or
raster branches are ever consulted. The new resolver is reachable **only** where `isInCordoba` is
false.

> **The validation population and the deployment population are disjoint. The classifier is
> validatable only where it is unreachable, and reachable only where it is unvalidatable.**

This is not an argument that the method is wrong — §4 shows it reproduces. It is an argument about
what a signature on the gate could possibly mean. Combined with §12.4's finding that per-class
precision is a property of each sheet's **class composition**, and that the composition of the 43
unvectorised sheets is unknown, a signer would be accepting a method whose error rate was measured
on *other land with a different class mix*, for records **no human has checked and no service can
corroborate**. Two further unmeasured risks compound it:

- **The `FP-only` mode is invisible off-pilot.** §12.4 measured four classes firing on sheets where
  they have zero ground truth. On the 43 unvectorised sheets that mode cannot be detected at all.
- **Dotacional and unscored parcels were never in the denominator.** 130 of CUS41W's 3 461 parcels
  (3.8 %) fall outside every COACo polygon and were *excluded* from scoring. Equipment parcels are
  real cadastral parcels; if they classify to MC or OA, that error is invisible to every precision
  figure in the study.
- **§8f's self-check gate is uncomputable in production.** §9.3 step 4 makes the georeference
  self-check a hard gate, and §12.5 correctly re-specifies it as a *ratio to chance*. But both
  formulations measure **zoning-boundary** coincidence, which requires the COACo vector. On the 43
  sheets where the gate is needed, it cannot be evaluated as specified. A substitute using
  colour-region edges instead of COACo edges is plausible and has **not** been validated.

I therefore did **not** generate and commit a citywide classified dataset. Doing so would have put
tens of thousands of unverifiable machine assertions about real people's land into the repo behind a
flag whose flip is a single boolean. The seam is built, tested and reviewable; populating it is a
separate, human-reviewed act, and the resolver's gate docstring says so in terms.

---

## 8. Deploy safety — my honest assessment

**`CORDOBA_ENVELOPE_VERIFIED` is live and signed, so anything reaching the dispatcher reaches real
users. Here is my confidence, stated without softening.**

### What I am confident about

- **This pass cannot change production behaviour.** Three independent reasons, each sufficient
  alone: the gate is `false`; the record set is `[]`; and the branch contains no call to
  `computeBuildableEnvelope`. The first two are pinned by test
  (`cordobaRasterClassifiedSiteDispatch.test.ts`), the third by construction and by the gate-open
  suite asserting every numeric field is null even with the gate mocked open.
- **The dispatcher edit is behaviour-preserving.** It replaces three `applyEstimatedZoning(...)`
  fall-throughs with a call that, gate-shut, does `applyEstimatedZoning(...)`. All 5 pre-existing
  Córdoba editor suites (38 tests) pass unchanged, including the traced-zone gate-open companion.
- **The safe-set guard is correct and closed.** MC and OA both hold ≥ 99.2 % precision on every
  sheet where they appear, each measured *with its tightest collider present*. Nine tests pin that
  every other family refuses.
- **Nothing was signed, scope-crept, or inherited.** The new gate is independent and defaults false.

### What I am NOT confident about, and would not sign

1. **I would not sign this gate today.** §7 is the reason: a signature cannot mean "these records
   were verified", because on reachable land no verification is possible, in principle, with today's
   sources. It could only mean "I accept a method validated on a different population." Given §12.4
   proved precision is composition-dependent and the reachable population's composition is unknown,
   I do not think that inference is available.
2. **My georeferencing is not reliably automatic.** I reproduced CUS41W and CUS34W *exactly*, and
   then mis-detected the frame on **2 of the other 4** sheets (CUS25W left edge, CUS46W bottom edge).
   On pilot sheets COACo catches that; off-pilot nothing does, and a bad transform yields a
   confident, self-consistent, wrong answer (§8f). **Before any record is generated, per-sheet
   georeferencing needs a validated, ground-truth-free self-check that does not exist yet.**
3. **The family claim itself is not transferable with a measured error rate.** MC's 99.8 % is
   99.8 % *on sheets with the pilot's class mix*. I believe it is likely to hold — MC's colliders are
   measured and its swatch is well-separated — but "likely" is the honest word, not "measured".
4. **I have not measured the false-positive rate on dotacional / non-ordenanza parcels**, which are
   a large share of the off-pilot fabric and were excluded from every figure in the study. This is
   my largest unquantified risk and I would want it closed before records ship.
5. **The empty dataset makes the wiring inert.** That is deliberate, but it means this pass ships a
   *seam and a proof*, not a working feature. If the intent was a shipped capability, this pass does
   not deliver one, and I would rather say that than dress up a no-op.

### What I would do next, in order

1. **Do not sign. Do not populate.** Review the seam; decide whether an inert seam is worth keeping.
2. **Close the georeference self-check** — a ground-truth-free per-sheet validator (colour-region
   edges vs Catastro parcel edges, gated on the ratio to chance per §12.5), validated on all six
   COACo sheets *including CUS46W*, before any sheet is classified.
3. **Measure the dotacional false-positive rate** by scoring the 130 CUS41W parcels the study
   excluded.
4. **Only then** consider generating records, one sheet at a time, each with a named human reviewer.

---

*Method: computed live 2026-08-05 from `coaco:ordenanzas` (453 features), `coaco:hojas_cus`
(8 features / 6 sheets) and the Catastro INSPIRE CP WFS, against the local corpus rasters
`corpus/cus/CUS{08,12,25,30,34,41,46}W.jpg`. OCR via `rapidocr-onnxruntime`, installed this session.
Prototype scripts are session-scoped scratch and are not in the repo; the load-bearing method is
reproduced in this document and in the resolver's own header. `CORDOBA_ENVELOPE_VERIFIED` was not
modified. Nothing was committed or pushed.*
