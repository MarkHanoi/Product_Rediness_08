# THE R/P FORMULATION — score ROUTING and EXTRACTION separately, `R` first

**Status**: ⭐ **NORMATIVE**, adopted 2026-08-02, founder-authored. **Applies to EVERY region, not
just Balears.**
**Related**: [REGIONAL-INTAKE-LIST](./REGIONAL-INTAKE-LIST.md) ·
[ADR-0293](../../02-decisions/adrs/ADR-0293-envelope-tier-is-per-dimension-and-keyed-on-error-direction.md) ·
[MADRID-DATA-INVENTORY](../jurisdictions/es/es-md/MADRID-DATA-INVENTORY.md) ·
[BALEARS-MUIB-ASSESSMENT](../jurisdictions/es/es-ib/BALEARS-MUIB-ASSESSMENT.md)

---

> ⭐ **Envelope = Geometry( P( R( parcel ) ) )**
>
> **`R`** = **ROUTING** — parcel → governing planning instrument → normative document
> **`P`** = **EXTRACTION** — document → geometric parameters
> **Geometry** = **universal, already built**

⛔ **SCORE `R` AND `P` SEPARATELY, AND SCORE `R` FIRST.** A single per-region percentage hides which
of the two is missing, and they have completely different costs and completely different fixes.

## The map, reordered

| Region | `R` (routing) | `P` (extraction) |
|---|---|---|
| **Catalunya** | ✅ **built manually** | ✅ |
| **Balears** | ⚠ **CLAIMED PUBLISHED** — unverified by us | ❓ |
| **València** | ✅ (`zon_suelo`) | ❓ |
| **Madrid** | ⛔ **BROKEN** — 179 corpora, no selector | ⚠ partial (`NM_ALTURA` 70.2 %) |
| **Aragón** | ⛔ **BROKEN** — 731 corpora | ⛔ |

## ⭐ Madrid is the proof this distinction matters

**Madrid HAS parameters and CANNOT SAY WHICH CORPUS GOVERNS.**

> ⛔ **`P` WITHOUT `R` IS WORTHLESS.**

That is **why Madrid scores 1 of 9 despite 93,839 populated features** — and it belongs in the
register as *the reason*, not as an unexplained low score. A region can be data-rich and
envelope-incapable at the same time, and only the R/P split makes that legible.

**The converse is the opportunity:** where a publisher has already done `R` — published the management
layer, the instrument extents, the delimitation polygons — **PRYZM's remaining work is `P` plus
geometry, and geometry is already built.**

## How it composes with the other frames

- **[REGIONAL-INTAKE-LIST](./REGIONAL-INTAKE-LIST.md)** — the nine items. **Item 2 (instrument
  selector) IS `R`.** Items 3–6 are `P`. Item 7 (constraints) is neither: it **subtracts** after both.
- **ER-1…ER-4** — the readiness ladder is per **grammar**; R/P is per **region**. A region with `R`
  solved can still be ER-2 everywhere if `P` is unproven.
- **[ADR-0293](../../02-decisions/adrs/ADR-0293-envelope-tier-is-per-dimension-and-keyed-on-error-direction.md)**
  — tiering is per **dimension** and keyed on **error direction**. R/P says *what is missing*;
  ADR-0293 says *whether a caveat can cover it*.

## ⛔ The trap that makes `R` look solved when it is not

**A per-feature normativa URL is NOT `R` until its DISTINCT-VALUE COUNT is measured.**

⚠ **València's `UrlLink` had 99 % coverage and TWENTY DISTINCT VALUES** — per-CCAA register
homepages, not per-feature documents. **Treating it as routing fabricated a ~99 % tier estimate.**

> ⭐ **Always report: coverage % AND distinct-value count. Coverage alone is the ninth-signal shape —
> a number that looks like an answer to a question it never addressed.**

## Reporting rule

⛔ **Never a single per-region number.** State `R` and `P` separately, with the ambiguity rate on `R`:

> ✅ *"`R` resolves uniquely on X % of sampled parcels; `P` unproven pending one ordinance read."*
> ❌ *"Balears is envelope-capable."*
