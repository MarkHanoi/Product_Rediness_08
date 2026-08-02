# VALÈNCIA — the ENVELOPE INPUT STATUS MATRIX, and the COVERAGE-LOSS decomposition

> **Date 2026-08-02.** Written to answer a founder check on our own reporting:
> *"Don't let **`altura`** become a catch-all explanation. List every input needed by the envelope
> engine… You may discover that only one or two variables truly block envelope generation."*
>
> **The check was right to run.** `altura` is **not** a catch-all — but neither is València a pure
> single-blocker city, and we had been describing it as one.

---

## 0 — The answer in three lines

1. ⭐ **If `altura` were answered tomorrow, an ENS/EDA envelope WOULD emit** — those are **54,37 pp**
   of buildable land, **85,5 %** of everything still reachable. Nothing else is being waited on for
   them. **One email is genuinely the whole gate for that share.**
2. ⚠ **But 9,22 pp would NOT emit**, and its blocker is not `altura` and not the founder's to clear:
   UFA's setback chapters and the CHP/TER/IND chapters are **unread by us**.
3. ⭐ **The engine already has València's rule kind.** `explicit-area` (ADR-0270) clips a parcel to a
   **published buildable footprint**, supports *patio de manzana* holes and multi-part footprints, and
   **hard-fails rather than falling through to a whole-parcel inset**. **No new solver is required.**

## 1 — Every input `computeBuildableEnvelope` needs

Read off `ComputeBuildableEnvelopeInput` in `ZoningRulesEngine.ts`, not from memory. Pinned in code as
`VALENCIA_ENVELOPE_INPUT_STATUS`.

| Input | Status | Zones | Source / why |
|---|---|---|---|
| `parcelRing` | ✅ **RESOLVED** | all | Catastro INSPIRE CP by identifier — **and** València publishes `refcat` on its own parcel layer. Two routes, no licence. PARCEL axis measured **99,2 %** (N=120, 0 failures) |
| `edgeClassifications` | ✅ **RESOLVED** | all | Derived from the ring against the street network. Nothing València-specific |
| `zoning.zoneCode` (`califi`/`tipoca`) | 🔧 **ENGINEERING** (ours) | all | Live and **keyless**; `califi` + `tipoca` + `origen` on ONE row, so no second join. Missing piece is the proxy + resolver (register #4), ~1 day |
| `geometricRule = explicit-area` | 🔧 **ENGINEERING** (ours) | ENS · EDA | ⭐ The kind **already exists** (ADR-0270). Declaring it on the pack is a data change, not a new solver |
| `explicitAreaFootprint` — **the buildable depth** | ✅ **RESOLVED** | ENS · EDA | ⭐ **D-005 / R1.** Layer 212 IS the published movement polygon; Art. 6.18.1 «La ocupación… se ajustará a las alineaciones definidas en el Plano C». Measured n=54: median mean-width **15,6 m**, never larger than its calificación polygon (**0/54**). Re-validated on every read |
| `setbacks.front/side/rear` | ✅ **NOT-THE-RULE-KIND** | ENS | ⭐ **Settled by article, not merely absent:** Art. 6.18.2 «**La edificación no podrá retranquearse de la alineación exterior**». Retranqueos are *forbidden* — a front/side/rear triple is the wrong SHAPE (ADR-0270), and for an explicit-area rule the footprint **is** the setback |
| `setbacks.front/side/rear` | ⛔ **UNREAD ORDINANCE** (ours) | **UFA** | ⛔ **The genuine second blocker.** UFA-2 (hilera) and UFA-3 (aislada) are **setback typologies**; their conditions live in Arts. 6.36/6.37 and 6.39/6.40, remitted by Art. 6.29.1 — **not read.** ~1 day |
| `maxFAR` (edificabilidad) | ✅ **NOT-THE-RULE-KIND** | ENS · EDA | ⭐ A **finding**, not a gap: the chapters contain **no edificabilidad figure at all** |
| `maxCoverage` (ocupación) | ✅ **NOT-THE-RULE-KIND** | ENS · EDA | ⭐ Art. 6.18.1 sets the ocupación **by the alignments** — the same geometry as the footprint, not a separate ratio |
| `permittedUse` (usos) | ✅ **RESOLVED** | all | Published as `uso` / `tipouso` / `uso_califi`. ⚠ Not an envelope-**geometry** input — it never shapes the solid, so it cannot block emission |
| `maxHeight_m` / `maxFloors` | ⛔ **EXTERNAL AUTHORITY** | ENS · EDA · UFA | ⛔ **THE GATE.** Art. 6.19.1 `Hc = 4,80 + 2,90·Np` (EDA 5,30), Np = graphed − 1. Owner: the founder (R5 Q4) |
| heritage overlay | ⛔ **EXTERNAL AUTHORITY** | all | ⚠ **Deployment only** (R3). Constrains downward *after* the base ordinance; the seam is built and refuses where heritage may apply |
| CHP · TER · IND, every input | ⛔ **UNREAD ORDINANCE** (ours) | CHP · TER · IND | ⚠ Chapters not read — **and `altura` is irrelevant to them.** 3,35 pp |

### ⚠ "Storeys vs metres" is NOT a second blocker

It was listed as a separate row in the brief and it is **not** one. The metres reading is **refuted**:
`altura`/OSM `building:levels` has a **median ratio of 0,78** over n=105, where metres predicts ≈3,0.
What remains open is only the **offset** — graphed count or Np. **One blocker, not two.**

## 2 — The COVERAGE-LOSS matrix: 100 % of buildable land in four buckets

Denominator: the L-656 private-buildable land, **1 869,6 ha** server-side (1 874,9 ha client-side —
the two methods agree to 0,28 %). Pinned as `VALENCIA_COVERAGE_LOSS`.

| Bucket | Share | Owner | Note |
|---|---:|---|---|
| **Legally impossible** | **36,40 %** | nobody — it is the right answer | Delegated to a derived instrument (PE 14,94 · RI 7,10 · MP 6,38 · ED 3,28 · PRI 2,17 · PP 1,89 · other 0,64). **Terminal, cited, CORRECT** — the archetype |
| **Awaiting authoritative interpretation** | **54,37 %** | the founder (R5) | ENS 32,97 + EDA 21,40. Gated by **`altura` alone** |
| **Awaiting interpretation AND our own reading** | **5,87 %** | founder **+** us | UFA — needs `altura` **and** Arts. 6.36/6.37/6.39/6.40 |
| **Awaiting our own reading alone** | **3,35 %** | us | CHP 0,81 + TER 0,93 + IND 1,61. **Independent of `altura`** |
| **Data unavailable** | **0,00 %** | — | ⭐ see below |
| **Engineering not yet implemented** | **0,00 pp of LAND** | us | Register #4 and the `explicit-area` declaration gate *emission*, not entitlement — they are not a land-share loss |
| **total** | **99,99 %** | | |

⚠ **Heritage is deliberately NOT a bucket.** It is an **orthogonal deployment gate** across all of the
above; counting it as a land share would double-count every parcel.

### ⭐ Two results worth stating plainly

**`Data unavailable` is EMPTY.** Before D-005 the entire 63,60 % sat in that bucket — *"Plano C is
unpublished: an institution, a fee, an unknown timeline"*. **After it, no València land is blocked by
missing data at all.** That is the single largest change the last two days produced, and it is not
visible in the ENVELOPE score, which is still 0 %.

**The 63,60 % `no-pack` DECOMPOSES, and the roadmap changes.** Reported as one block it read as
*"63,60 % waiting on `altura`"*. Measured: **54,37 pp is,** and **9,22 pp is not.**

## 3 — The reporting error this caught, stated against ourselves

Our own NEXT.md said *"`altura` semantics: single remaining technical/legal blocker"*. Measured over
the land, that is true of **85,5 %** of what is reachable and **false of 9,22 pp**. The 9,22 pp is
cheap and it is **ours** — roughly two days of reading — but it was invisible while `altura` carried
the whole explanation.

⚠ **It cuts the other way too, and that half must not be lost:** the exercise did **not** turn up a
hidden second gate on ENS/EDA. Setbacks, FAR and ocupación are all **settled by article** for those
zones — `not-the-rule-kind`, with the article quoted. Marking any of them "unknown" to look thorough
would have manufactured a blocker that does not exist, which the brief explicitly forbade and which
would have been the same error in the opposite direction.

## 4 — What this changes

1. **The R5 email is worth more than we said.** It unlocks **54,37 pp** — 85,5 % of reachable land —
   not "the envelope".
2. **A new, cheap, OURS work item appears**: read UFA Arts. 6.36/6.37/6.39/6.40 (5,87 pp) and the
   CHP/TER/IND chapters (3,35 pp). **~2 days, no external dependency**, and it can proceed in
   parallel with the wait. It was previously buried under `altura`.
3. **The engineering estimate shrinks.** `explicit-area` already exists; ENS/EDA need a rule
   declaration and a footprint injection, not a solver.
4. ⚠ **One residual engineering risk, named not estimated.** `solveExplicitArea` refuses
   `non-convex-both` — where neither parcel nor footprint is convex it will not approximate
   (C58 §1.4). València's movement polygons carry holes on ~19 % of sampled ENS/EDA land, so a
   non-zero share of parcels will take that refusal. **It is a refusal, never a wrong number**, and
   its size is **unmeasured** — so it is recorded as a named risk, not a number.

---
*Authority: C58 §1.2/§1.4/§1.5/§1.9/§1.14.4 · C11 · C63 §1.1 · ADR-0270 · ADR-0283 · ADR-0287 ·
D-005 · L-616 · L-656 · BLOCKER-CLASSIFICATION-STANDARD. Land shares from
[`VALENCIA-LAND-SHARE-MEASUREMENT-2026-08-01.md`](./VALENCIA-LAND-SHARE-MEASUREMENT-2026-08-01.md)
and [`VALENCIA-ALTURA-BUILDABLE-JOIN-2026-08-01.md`](./VALENCIA-ALTURA-BUILDABLE-JOIN-2026-08-01.md);
inputs read off `packages/site-parcel-data/src/ZoningRulesEngine.ts`. Pinned by
`__tests__/valenciaAlineaciones.test.ts`.*
