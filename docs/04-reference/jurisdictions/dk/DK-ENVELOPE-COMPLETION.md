# DK — envelope completion status

> **Stamp** 2026-09-04 (**round 4**) · **Source** lane ENVELOPE-NLDK primary measurement (D1–D6 +
> gate probes; commits `d0498f8b`, `8bbbf67c`, `ccb451b1`, code swept into `3b0afbb5` / `5d88c841`,
> then `dd279349` (D-tracks) and `b21b7b50` (graphic leg)) · **Pattern** identical across all 16
> jurisdiction dossiers.
>
> ⭐ **ROUND-4 CORRECTION.** §3 items **3, 5 and 7** were written as *NOT BUILT*. **All three have
> since landed in code and this document did not move with them** — `dkGraphicLeg.ts`,
> `dkZoneStatus.ts`, `dkOverlayClassification.ts`. Each row now carries its **as-built** state; the
> pre-build prose is kept above it so the delta is visible rather than erased. *(The NL dossier had
> the identical failure — see `../nl/NL-ENVELOPE-COMPLETION.md`. An answer that lives only in a
> source file has not been delivered.)*
>
> ⛔ **Every number here is MEASURED and names its method.** Where a figure was never measured the
> cell says `not-measured`. **Denmark's dominant blocker is a CREDENTIAL, not an absence** — read §3.1
> before concluding anything about Danish data availability.
>
> **Findings:** `docs/04-reference/jurisdictions/dk/findings/dk-phase0/`.

---

## §1 — Completion

### §1.1 — D6 · deterministic envelope rate

| Sample | Value |
|---|---|
| land-random | **2.0 %** |
| urban | **5.8 %** |

**Definition** — the share of sampled parcels for which a **deterministic** buildable envelope can be
composed today, i.e. with no unresolved parameter and no conditional treated as an entitlement.

⚠ **This is the honest floor, not a ceiling**, and §3.1 explains why: the two largest unlocks are
credential-gated, so the figure measures *what PRYZM can reach*, not *what Denmark publishes*.

### §1.2 — ⭐ D2 · the ladder INVERTS

| Instrument | Publishes a height on |
|---|---|
| **byggefelt** (geometrically strongest) | **1 / 15** |
| **kommuneplanramme** (coarsest) | **60.7 – 74.1 %** |

> **The most precise instrument carries the fewest numbers, and the vaguest carries the most.** Any
> design that walks the hierarchy strongest-first and stops at the first hit will return `unresolved`
> on almost every parcel.

### §1.3 — ⭐ D3 · the denominator is the binding constraint

- Only **~30 %** of populated `bebygpct` is **parcel-scoped**.
- The commonest area-basis code is **`2 = ejendom` at ~40 %** — and it is **refused**, because PRYZM
  does not hold the property boundary.

> ⭐ **`BFE → ejendom` geometry is the single highest-value Danish unlock — and it is a CREDENTIAL
> blocker, not an engineering one.**

### §1.4 — ⭐ D4c · an exceptionless law in the data

**`iomfangreg = true` co-occurs with a published number 0 / 183 times. Exceptionless.**

Two consequences, and the second is a correction:
- ⛔ It is **NOT** the overstatement exposure the audit ranked #2. **Reporting it as one would have
  been stale-pessimistic** — the same defect class CLAUDE.md documents against itself.
- ⭐ It **IS Denmark's F1 discriminator**, and it covers **over 61.2 % of lokalplan features**: where
  `iomfangreg` is set, the plan regulates volume **by drawing, not by number**. That is *a plan
  governing with no envelope mechanism served* — F1, cleanly identified, from one flag.

### §1.5 — D5 · zone codes are composite

**Zone codes 4 and 7 are COMPOSITE.** Collapsing them to `byzone` **violates RULE 8** of the founder's
Denmark doctrine (conditional ≠ allowed). They must be decomposed, not flattened.

---

## §2 — What is ACCESSIBLE today

- **Planning geometry + attributes (Plandata)** — 🟢 `source-complete`, keyless. Lokalplan,
  kommuneplanramme, byggefelt, zonekort.
- **`kommuneplanramme` height** — 🟢 **60.7 – 74.1 %** populated (D2).
- **`bebygpct`** — 🟡 populated, but **only ~30 % parcel-scoped** (D3).
- **`iomfangreg` flag** — 🟢 100 % usable as an F1 discriminator over **61.2 %** of lokalplan
  features (D4c).
- **Legislation corpus** — 🟢 offline: `DENMARK-LEGISLATION-EXTRACTION.json` + `.md`, Retsinformation
  acts, BR18 provisions.
- **Zone classification** — 🟢, with the composite-code caveat at §1.5.
- **Cadastral parcel geometry (Matrikel `mat:Jordstykke`)** — 🔴 **credential-gated**, see §3.1.
- **BBR building registry** — 🔴 **credential-gated** (HTTP **403**).
- **GeoDanmark topography** — 🔴 **credential-gated** (HTTP **401**).
- **DHM terrain** — 🔴 **HTTP 404** anonymously.

---

## §3 — What is BLOCKING

### §3.1 — ⛔ 1. Datafordeler credentials — `credential-gated`, and it is NOT "no data"

The lane re-probed rather than trusting the prior "uniform 404" claim, and **the prior claim was
wrong on the facts while right on the conclusion**:

| Service | Anonymous response |
|---|---|
| **MAT** (Matrikel / cadastral parcels) | **401** |
| **GeoDanmark** | **401** |
| **BBR** (buildings) | **403** |
| **DHM** (terrain) | **404** |

> **Same conclusion — a credential blocker — but a different fact.** A 401/403 is a service telling
> you to log in. Reporting that as "Denmark has no data" would be the inverse of the truth.

**Unblock:** a free Datafordeler service user (`DATAFORDELER_USERNAME` / `DATAFORDELER_PASSWORD`).
**Not present at measurement time.** This one credential gates parcel geometry, buildings, topography
**and** the `BFE → ejendom` join that §1.3 names as the highest-value unlock.

### §3.2 — The rest, ranked

- **2. `ejendom` property boundary absent — `credential-gated`.** ~40 % of `bebygpct` is scoped to
  `ejendom` and therefore **refused**. Downstream of §3.1.
- **3. F1 is structural at 61.2 % of lokalplan features — `graphic`.** `iomfangreg = true` means the
  regulation is **drawn**, not numbered. **No credential fixes this**; it needs the graphic leg.
  > ✅ **AS BUILT (`dd279349`, `b21b7b50`) — `dkGraphicLeg.ts`, and it is MEASURED, not asserted.**
  > `resolveDkGraphicLeg()` routes the drawn regulation by AUTHORITY ORDER — **byggefelt geometry**
  > (the digitised drawing) → **delområde extent** (the area the drawn rule applies to, an upper
  > bound) → **document kortbilag** — and a *transient* byggefelt fetch marks the route
  > `byggefelt-unresolved` and the answer **UNCACHEABLE** rather than falling silently through to a
  > PDF pointer (§FAILURE-IS-NOT-EMPTY: a retry could replace a PDF with plan geometry).
  > **Census `DK_GRAPHIC_ROUTE_CENSUS_2026_09_04`, seed `20260903`:**
  >
  > | arm | rows w/ lokalplan | `iomfangreg` true | byggefelt-geometry | delområde-extent | document-kortbilag |
  > |---|---|---|---|---|---|
  > | land | 54 | 30 | 4 | **22** | 4 |
  > | urban | 67 | 47 | 8 | **33** | 6 |
  >
  > ⭐ **The delområde route dominates** — the drawn rule is most often reachable only as an *extent*,
  > which is an upper bound and must be rendered as one. **All 76 distinct doklinks answered
  > (`206`, `application/pdf`, `dokument.plandata.dk`)** — the documents are reachable; they are
  > PDFs. **byggefelt publishes a height ONCE across all 121 rows** (land 1, urban 0), which is D2's
  > inversion measured a second way. ⛔ **Still open:** reading the kortbilag itself.
- **4. Four Part 5–10 endpoints are dead — `inaccessible`.** Miljøportal, SLKS/FBB, LER, DAWA-BBR.
  ⛔ **Marked `UNVERIFIED-ENDPOINT`, NOT `absent`**, per the doctrine's RULE 2 (*never invent an
  endpoint; unverifiable ⇒ mark UNVERIFIED*).
- **5. Composite zone codes 4 and 7 — `semantic`.** Flattening violates RULE 8.
  > ✅ **AS BUILT (`dd279349`) — `dkZoneStatus.ts`.** The **live 7-row state codelist**
  > (`pdk:theme_pdk_codelist_zonestatus_v`, read 2026-09-04) is carried with a `members` column, so
  > **4 = byzone + landzone** and **7 = byzone + landzone + sommerhusområde** decompose rather than
  > flatten — and **5** (`sommerhus + landzone`) and **6** (`by + sommerhus`) are composite too, which
  > the pre-build row did not name. `resolveDkParcelZone()` has five arms including
  > **`composite-unresolved`** (members named, none picked) and **`zonekort-disagrees`** (a data
  > conflict surfaced, not averaged). `DK_LANDZONE_R8_NOTE` states RULE 8 in the code: **landzone is
  > not automatic no-build and not an entitlement** — building there is a *landzonetilladelse* matter
  > (Planloven §35), i.e. **CONDITIONAL volume, never added to the deterministic volume.**
- **6. `niveauplan` vs DHM terrain — `semantic`.** RULE 5: **physical ≠ legal.** DHM elevation is
  **not** an established legal *niveauplan*; `physical_terrain_reference` and
  `legal_height_reference` must stay separate fields.
- **7. Overlay classification not built — `not-built`.** EXCLUSION / CONDITIONAL / SCREENING /
  INFORMATIONAL was **not implemented this lane**. Until it is, no overlay may be treated as
  `NO_BUILD`.
  > ✅ **AS BUILT (`dd279349`) — `dkOverlayClassification.ts`.** The four legal effects ship as a
  > closed type **plus a fifth, `UNCLASSIFIED`** — an overlay we do not recognise is *named as
  > unrecognised*, never defaulted into one of the four. `DK_OVERLAY_REGISTRY` maps each overlay kind
  > to its effect and to what it **affects** (`footprint` / `height` / `use` / `assessment`), and
  > **`dkOverlaysPermitNoBuild()` requires an EXPLICIT prohibition** (`DkExplicitProhibition`) — an
  > overlay's mere presence never yields `NO_BUILD`. ⛔ **That is the whole point of the item**: the
  > blanket-NO_BUILD reading is what the type system now makes unrepresentable.
- **8. F1/F2 split of the 439 no-plan parcels — `not-built`.** Explicitly refused and recorded, not
  silently skipped.

---

## §4 — Per-parameter state

| Envelope slot | State | Evidence |
|---|---|---|
| **Parcel geometry** | **undeterminable (from this egress)** | MAT **401** — credential-gated |
| **Terrain (physical)** | **undeterminable (from this egress)** | DHM **404** anonymously |
| **Legal height datum (`niveauplan`)** | **interpretive** | RULE 5 — never derived from DHM |
| Zone classification | **source-complete** | codes **4, 5, 6, 7 composite** — decomposed by `dkZoneStatus.ts`, resolved by zonekort where it agrees, `composite-unresolved` where it cannot |
| Applicable plan + version | **source-complete** | Plandata, keyless |
| **Max height** | **source-complete where present** | kommuneplanramme **60.7–74.1 %**; byggefelt **1/15** |
| Storeys (`maxetage`) | **not-measured** | |
| **`bebygpct` (site coverage)** | **source-complete, DENOMINATOR-BLOCKED** | only ~30 % parcel-scoped; ~40 % scoped to `ejendom` and refused |
| Floor-area (`eareal` / `m3_m2`) | **not-measured** | |
| Setbacks | **not-measured** | |
| **Volume regulation** | **F1 → now ROUTED** | ⭐ `iomfangreg` co-occurs with a number **0/183** over **61.2 %** of features; `dkGraphicLeg.ts` routes it — of the **77 `iomfangreg`-true rows** (121 carried a lokalplan): byggefelt 12 · **delområde 55** · document 10 |
| Roof geometry | **not-measured** | |
| Density (`boligenhed`) | **not-measured** | |
| Existing buildings (BBR) | **undeterminable (from this egress)** | **403** — and BBR is **registered existing state, never future rights** (RULE 6) |
| Overlays (nature, coast, heritage, road, rail, aviation) | **classified** | `DK_OVERLAY_REGISTRY` — EXCLUSION / CONDITIONAL / SCREENING / INFORMATIONAL **+ `UNCLASSIFIED`**; `NO_BUILD` needs an EXPLICIT prohibition |
| Landzone | **interpretive** | ⛔ landzone is **not** automatic no-build |

---

## §5 — Next measurable step

**Obtain the free Datafordeler service user.** It is a registration, not a purchase, and it
simultaneously unlocks:
- cadastral parcel geometry (MAT),
- the **`BFE → ejendom` join** that §1.3 identifies as the highest-value Danish unlock,
- BBR buildings,
- GeoDanmark topography.

Then re-run D1–D6. **The 2.0 % / 5.8 % deterministic rate is measured against a gated estate; it will
move, and the delta is the measurement.**

✅ **Second step of the previous revision — "build the graphic leg" — IS BUILT** (§3 item 3). The
credential-free step that replaces it is narrower and sharper: **read the kortbilag**, or render the
**delområde extent** honestly as the upper bound it is, because that route carries **55 of 121**
measured rows and today yields an extent rather than a footprint.

⛔ **And note what the two dossiers share:** Denmark's next step and the Netherlands' next step are
**both a free registration a human must complete** (`DATAFORDELER_*` here, `DSO_API_KEY` there). In
neither country is the dominant blocker engineering, and in neither can this lane close it.

---

## §6 — Gaps in evidence

- Storeys, floor-area indices, setbacks, roof geometry and density — **not measured**.
- ⛔ **Reading the kortbilag.** The graphic leg now ROUTES the drawn regulation and proves the
  documents are reachable (**76/76 doklinks answered `206 application/pdf`**), but nothing reads the
  drawing. The dominant route is **delområde extent** — **55 of the 77 `iomfangreg`-true rows, 71 %** —
  and an extent is an **upper bound**, not a footprint. It must be rendered as one.
- **F1/F2 split of the 439 no-plan parcels** — still not completed. ⚠ **The classification is not
  obvious and must not be guessed:** a parcel with no lokalplan is usually *governed by a coarser
  instrument* (kommuneplanramme) or, in landzone, by a **discretionary permission** (Planloven §35) —
  which is `refused` / `requires-determination`, **not** F1. Recording it as F1 would assert the law
  is silent where it is in fact conditional.
- ✅ **NOT gaps any more** (the previous revision listed them): **overlay classification** and the
  **composite zone codes** are built — see §3 items 5 and 7.
- Doctrine arms **R3, R5, R6 are marked NOT EXERCISED, not passed** — their data is credential-gated,
  so the rules could not be tested. ⭐ *Not exercised* and *passing* are different verdicts and are
  recorded as such.
- The DK master prompt is **TRUNCATED mid-Part-10** in transmission; whatever followed Part 10 is not
  in the repo and **must not be reconstructed**.
