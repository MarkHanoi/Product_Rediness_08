# DK — envelope completion status

> **Stamp** 2026-09-04 · **Source** lane ENVELOPE-NLDK primary measurement (D1–D6 + gate probes;
> commits `d0498f8b`, `8bbbf67c`, `ccb451b1`, and code swept into `3b0afbb5` / `5d88c841`) ·
> **Pattern** identical across all 16 jurisdiction dossiers.
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
- **4. Four Part 5–10 endpoints are dead — `inaccessible`.** Miljøportal, SLKS/FBB, LER, DAWA-BBR.
  ⛔ **Marked `UNVERIFIED-ENDPOINT`, NOT `absent`**, per the doctrine's RULE 2 (*never invent an
  endpoint; unverifiable ⇒ mark UNVERIFIED*).
- **5. Composite zone codes 4 and 7 — `semantic`.** Flattening violates RULE 8.
- **6. `niveauplan` vs DHM terrain — `semantic`.** RULE 5: **physical ≠ legal.** DHM elevation is
  **not** an established legal *niveauplan*; `physical_terrain_reference` and
  `legal_height_reference` must stay separate fields.
- **7. Overlay classification not built — `not-built`.** EXCLUSION / CONDITIONAL / SCREENING /
  INFORMATIONAL was **not implemented this lane**. Until it is, no overlay may be treated as
  `NO_BUILD`.
- **8. F1/F2 split of the 439 no-plan parcels — `not-built`.** Explicitly refused and recorded, not
  silently skipped.

---

## §4 — Per-parameter state

| Envelope slot | State | Evidence |
|---|---|---|
| **Parcel geometry** | **undeterminable (from this egress)** | MAT **401** — credential-gated |
| **Terrain (physical)** | **undeterminable (from this egress)** | DHM **404** anonymously |
| **Legal height datum (`niveauplan`)** | **interpretive** | RULE 5 — never derived from DHM |
| Zone classification | **source-complete** | ⚠ codes 4, 7 composite |
| Applicable plan + version | **source-complete** | Plandata, keyless |
| **Max height** | **source-complete where present** | kommuneplanramme **60.7–74.1 %**; byggefelt **1/15** |
| Storeys (`maxetage`) | **not-measured** | |
| **`bebygpct` (site coverage)** | **source-complete, DENOMINATOR-BLOCKED** | only ~30 % parcel-scoped; ~40 % scoped to `ejendom` and refused |
| Floor-area (`eareal` / `m3_m2`) | **not-measured** | |
| Setbacks | **not-measured** | |
| **Volume regulation** | **undeterminable → F1** | ⭐ `iomfangreg` co-occurs with a number **0/183**, over **61.2 %** of features |
| Roof geometry | **not-measured** | |
| Density (`boligenhed`) | **not-measured** | |
| Existing buildings (BBR) | **undeterminable (from this egress)** | **403** — and BBR is **registered existing state, never future rights** (RULE 6) |
| Overlays (nature, coast, heritage, road, rail, aviation) | **not-built** | classification unimplemented |
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

Second, independent of any credential: **build the graphic leg** for the **61.2 %** of lokalplan
features where `iomfangreg` says the volume is drawn rather than written.

---

## §6 — Gaps in evidence

- Storeys, floor-area indices, setbacks, roof geometry and density — **not measured**.
- **Overlay classification** (EXCLUSION / CONDITIONAL / SCREENING / INFORMATIONAL) — **not built**.
- **F1/F2 split of the 439 no-plan parcels** — not completed.
- Doctrine arms **R3, R5, R6 are marked NOT EXERCISED, not passed** — their data is credential-gated,
  so the rules could not be tested. ⭐ *Not exercised* and *passing* are different verdicts and are
  recorded as such.
- The DK master prompt is **TRUNCATED mid-Part-10** in transmission; whatever followed Part 10 is not
  in the repo and **must not be reconstructed**.
