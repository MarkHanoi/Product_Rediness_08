# LEGISLATION-RATE — Amsterdam (`0363`) city — structured legislation/data-fill rate

> Feeds C63 Axis 2 (LEGISLATION). Composite master scorecard: [`RATE.md`](./RATE.md). Convention: `../../../_TEMPLATE/NAMING-CONVENTION.md`.

**Headline rate: `NOT YET ASSESSED`** (`pending-implementation`)

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric + height**)
> **without reading an ordinance text/PDF**. IDENTICAL definition across every jurisdiction so the
> scores are directly comparable. This audit has NOT run the NL structured-fill probe, so no headline
> number is asserted (`not-assessed` ≠ 0 %, C63 §1.2).

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| Paris | ~35% |
| **Amsterdam / Netherlands** | **not-assessed** |

## Why this is `not-assessed`, not a number

The Netherlands is **mid-transition**: the **Omgevingswet** entered force **1 Jan 2024**, replacing the
per-gemeente **bestemmingsplan** with one gemeente-wide **omgevingsplan**, served through the national
**DSO** (Digitaal Stelsel Omgevingswet) / `ruimtelijkeplannen.nl` register and the STOP/TPOD standard. The
building rules (goothoogte / bouwhoogte / bebouwingspercentage / functie) are structured per *gebied* — this
is a genuinely strong structured-legislation environment on paper — **but the per-clau fill has not been
probed or wired here**, and the transition means the operative document for a given Amsterdam parcel may be a
legacy bestemmingsplan under the omgevingsplan's transitional law. Asserting a fill rate without that probe
would be a fabrication.

## What an assessment would read (candidate sources — NOT yet probed/wired)

| Field | Candidate source | Status |
|---|---|---|
| Parcel geometry | Kadaster BRK via PDOK (`pdok-nl`) | ✅ wired + live (see `RATE.md` Axis 1) |
| Zone/function + height rules | omgevingsplan via DSO / `ruimtelijkeplannen.nl` (STOP/TPOD) | ⚠️ national register known; NOT probed/wired this audit |
| Building geometry + address | BAG (Basisregistratie Adressen en Gebouwen) | ⚠️ national; 3DBAG joins BAG × AHN (heights wired) |
| Building height (measured) | 3DBAG (BAG × AHN LiDAR) | ✅ wired + live (`heightSources.mjs 3dbag`) |

## What would produce a rate

1. Probe the DSO / `ruimtelijkeplannen.nl` API for an Amsterdam parcel → confirm the omgevingsplan returns a
   structured function + height (goothoogte/bouwhoogte) attribute vs. a PDF/text rule.
2. Sample N Amsterdam parcels → compute the structured-fill fraction (the IDENTICAL cross-jurisdiction ruler).
3. Record clause citations in `sources/SOURCES.md`; obtain the L-449 `VERIFICATION.md` sign-off.

**Expected position (NOT asserted):** NL's national structured-legislation framework is strong (comparable to
the Nordics on paper), so a probed rate is plausibly high — but this is a hypothesis to test, not a number to
publish. The `RATE.md` Axis 2 stays `not-assessed` until the probe runs.

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. No numeric rule value is certified — `sources/VERIFICATION.md` (OPEN).*
