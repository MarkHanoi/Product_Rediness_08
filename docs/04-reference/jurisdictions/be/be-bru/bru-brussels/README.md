# Brussels-Capital Region (`bru-brussels`) — Jurisdiction Pack

> **Dossier note (C63 naming, L-649/L-650).** This dossier's master scorecard face is now
> [`RATE.md`](./RATE.md) — the 7-axis composite completion rate (**research-only / NOT bake-covered** →
> all axes `not-assessed`, no scorecard computed). The legislation/data-fill rate was renamed
> `RATE.md` → [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) and now FEEDS it as Axis 2 (see
> [`NAMING-CONVENTION`](../../../_TEMPLATE/NAMING-CONVENTION.md)).

**Country:** `be` · **Region:** Brussels-Capital · **ISO 3166-2:** `BE-BRU` · **NIS code:** `21000` ·
**Pack id:** `be-bru-brussels` ·
**Governing instruments:** PRAS (land-use affectation) + RRU Titre I (regional gabarit default) +
RRUZ / PPAS / PAD (local overrides) ·
**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — research complete; no pack implemented

---

## 1 — What governs here

- **Governing-instrument chain:** `parcel → PRAS zone → RRU Titre I (default) | RRUZ | PPAS | PAD → CoBAT + bon-aménagement-des-lieux derogation test`.
- **Rule KIND (ADR-0270 / C58 §2.2):** NEW KIND REQUIRED — a **context-relative computed-envelope** KIND. Founder primary-source dig (2026-07-31, official RRU Titre I `urbanisme.irisnet.be/pdf/RRU_Titre_1_FR.pdf` + etaamb): **buildable DEPTH is a confirmed Art. 4 resolver** — `depthLimit = min(0.75·parcelDepth, neighbourRule())` (≤¾ parcel depth + neighbour rule). **HEIGHT is contextual** — there is NO per-zone table, and the widely-cited `H = P + 3 + D` formula is **NOT located in the official text (UNCONFIRMED — do NOT encode)**; height is instead **geometry-derived** from the official UrbIS-3D CityGML product (`height = maxRoofZ − minGroundZ`, a reusable CityGML parser). The KIND encodes the depth resolver + geometric height, never a static height number. FAR is genuinely absent (`n-a`).
- **Setback-governed vs alignment-governed:** RRU Titre I **Art. 3 implantation** sets the front façade at the **alignment / building line** (categorical — encode "alignment", NOT a metre value), with construction permitted on/against the shared lateral boundary. Rear **profondeur de bâti** is the Art. 4 depth resolver above.
- **Legal-structure trap watch (P1):** the RRU is a **regional default** — it applies only where a PPAS (commune-level detailed plan), RRUZ (zoned regional override), or PAD (Plan d'Aménagement Directeur) does NOT provide otherwise. The precedence check (PPAS/RRUZ/PAD > RRU) must run before any RRU rule can be shipped. This is the Brussels analogue of Germany's §30/§34/§35 classifier — a three-step instrument-priority check.
- **Additional constraint layers (§A.8 of master study):** CBS+ (Coefficient de Biotope par Surface) and the TOTEM life-cycle gate (demolitions > 1,000 m²) are adjacent constraints from the current RRU reform project. Confirm their regulatory status before authoring any Brussels demolition/rebuild card.

### Instrument precedence (must resolve per parcel before numeric sourcing)

| Priority | Instrument | Scope | Gabarit content |
|---|---|---|---|
| 1 (highest) | **PAD** (Plan d'Aménagement Directeur) | Specific project/district | Contains its own gabarit rules; overrides all below |
| 2 | **RRUZ** (Règlement Régional d'Urbanisme Zoné) | Specific district | Locally replaces RRU Titre I; e.g. "Projet Urbain Loi" tower district |
| 3 | **PPAS** (Plan Particulier d'Affectation du Sol) | Commune-level detailed plan | Contains its own gabarit/siting rules; overrides RRU |
| 4 (default) | **RRU Titre I** | All 19 Brussels communes | The regional default: Art. 4 depth resolver (≤¾ parcel depth + neighbour rule) + Art. 3 alignment; height contextual/geometry-derived (`H = P + 3 + D` UNCONFIRMED, not encoded) |

⚠ The PRAS governs **land-use affectation** (what can be built), not gabarit (how tall/deep). The
PRAS query gives the zone type; the RRU/PPAS/RRUZ/PAD query gives the envelope rules.
High-rise construction is separately subject to a per-project RRU derogation (bon-aménagement-des-lieux
justification required for each tower), per Conseil d'État case law.

---

## 2 — Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **Instrument-priority classifier** (PPAS/RRUZ/PAD > RRU) | NOT STARTED | Brussels PRAS WFS and PPAS/RRUZ layers accessible live; instrument-priority check built |
| **PRAS zone query** | NOT STARTED — endpoint bot-blocked | Brussels PRAS WFS live access confirmed (requires Belgian-IP or alternative path) |
| **RRU Titre I formula encoder** | NOT STARTED | New rule KIND for context-relative height formula ratified; RRU Titre I Art. 4–6 text read from primary source |
| **Street-width (P) source** | NOT STARTED | UrbIS road layer probed for `width` / `largeur` attribute; or geometric derivation method confirmed |
| **Context-data (LOD buildings + LiDAR)** | NOT STARTED | Brussels building-height source confirmed (CADMAP sublayer or UrbIS or LiDAR programme) |
| **Heritage overlay** | NOT STARTED | Direction du Patrimoine culturel GIS layer confirmed live |
| **CBS+ / TOTEM gate** | NOT STARTED | Regulatory status in current RRU reform confirmed |

Refusal vocabulary in use: `regime-undetermined` (instrument-priority check not yet run) ·
`legal` (parcel inside a high-rise derogation zone — no standard RRU answer applies) ·
`coverage-gap` (PPAS/RRUZ/PAD governs but text not yet sourced) ·
`construction-incomplete` (street-width P not derivable for this parcel)

---

## 3 — Granularity (C58 §1.11)

The PRAS zone applies at the **zone polygon** level (much larger than a parcel — the PRAS covers all
19 communes with a relatively coarse affectation grid). The RRU Titre I formula applies
**per-parcel** because it depends on the specific parcel's depth (D) and its street's width (P).
A PPAS or RRUZ applies at the **plan boundary** level (a specific commune area or district).

**Granularity: parcel-level calculation required for every RRU Titre I output** — P and D are not
zone-level constants. Never present a PRAS zone type as if it were a height ceiling; it is a
land-use category, not a dimensional rule.

---

## 4 — The number

**0% of clicks return a full, cited envelope (not started).** Denominator: any Brussels parcel for
which (a) the instrument-priority check places it under RRU Titre I or a PPAS/RRUZ with known
numeric content, AND (b) the street-width (P) and parcel-depth (D) inputs are queryable, AND (c)
the output formula can be evaluated. This denominator is itself unknown until access to the PRAS
and RRU endpoints is confirmed.

**Research estimate for Brussels specifically: ~5–10%** structured-numeric-fill rate (see `LEGISLATION-RATE.md §2`).
The non-zero credit reflects structured-but-non-dimensional GIS layers (accessibility zones A/B/C
under Titre VIII, office-quota zones under PRAS) rather than the height/gabarit path itself.

---

## 5 — Envelope mechanism (RRU Titre I) — depth confirmed, height contextual

> **⚠ Corrected 2026-07-31 (founder primary-source dig, official RRU Titre I).** The prior worked
> example applied `H = P + 3.00 + D` as the height rule. That formula is **NOT located in the official
> RRU Titre I text — it is UNCONFIRMED and must NOT be encoded.** What the official text DOES specify:

**Buildable DEPTH — Art. 4 (CONFIRMED + encodable):**
`depthLimit = min(0.75·parcelDepth, neighbourRule())`
- **¾ rule:** depth ≤ ¾ of parcel depth (Art. 4 §1(1)) — measured excluding the front-setback area, along the parcel median axis.
- **both neighbours built:** ≤ the deeper neighbouring profile, AND ≤ shallower neighbour **+3 m** unless a **≥3 m lateral setback** is provided.
- **one neighbour:** neighbour depth **+3 m** unless a 3 m side setback. **no neighbours:** only the ¾ rule.
- Inputs: parcel geometry + neighbour footprints (via the UrbIS combined product `BL_ID` block) — a resolver, never a stored number.

**Implantation — Art. 3:** front façade at the **alignment / building line** (categorical, NOT metres); construction on/against the shared lateral boundary. Encode "alignment".

**HEIGHT — contextual, geometry-derived:** there is **no per-zone height table** in RRU Titre I, and `H = P + 3 + D` is **UNCONFIRMED** (not in the official text — do NOT encode). The tractable path is a **geometric derivation** from the official **UrbIS-3D CityGML** product: `height = maxRoofZ − minGroundZ` (RoofSurface/GroundSurface Z) — a reusable CityGML parser. Base UrbIS Buildings has NO height attribute; UrbIS-3D schema/CRS/LoD is unprobed (honest blocker).

**Demolition/rebuild special rule:** a RRUZ's height/siting articles apply in full to demolition/
reconstruction — a demolition/rebuild resets which numeric regime applies, and may trigger the
CBS+ and TOTEM life-cycle gate requirements under the current RRU reform.

---

## 6 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `sources/SOURCES.md`.

- **PRAS live access:** `gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows` is bot-blocked. A Belgian-IP
  deployment or alternative access path is the prerequisite for all Brussels pack work.
- **RRU Titre I height:** the `H = P + 3 + D` formula is **NOT in the official text (UNCONFIRMED — do
  NOT encode)**; there is no per-zone height table. Height must be geometry-derived from UrbIS-3D CityGML
  (`maxRoofZ − minGroundZ`) whose schema/CRS/LoD is unprobed. (Art. 4 depth + Art. 3 implantation ARE
  read verbatim — see §5 — but their consolidated article citations must be pinned by a verifier.)
- **PPAS/RRUZ/PAD coverage in Brussels:** what fraction of Brussels parcels are governed by a PPAS,
  RRUZ, or PAD rather than the RRU default? This instrument-priority chain is the Brussels analogue of
  Germany's §34-fraction probe — measure before committing a dev-day budget (needs live access).
- **Street-width (P):** P is geometrically computable (road-polygon median cross-section / façade-to-
  façade) — NOT blocked on a `largeur_rue` attribute. NB with the height formula unconfirmed, P is not
  needed for any confirmed height rule.
- **Brussels LiDAR/building height:** no standalone Brussels LiDAR programme identified. UrbIS is
  not confirmed as a LiDAR-derived building-height product.
- **CBS+ regulatory status:** appears in the current RRU reform project documentation; confirm
  whether it is enacted law or a draft at the time of any Brussels pack implementation.

---

**Related files:** `../../README.md` (country umbrella) · `../../NEXT.md` (blockers + resume) ·
`../../findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md §B.1` (full Brussels analysis) ·
`sources/SOURCES.md` · `NEXT.md`
