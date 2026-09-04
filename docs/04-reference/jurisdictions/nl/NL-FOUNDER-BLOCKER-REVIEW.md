# NL — the founder's blocker review (transmission, 2026-09-04)

> **PROVENANCE.** Founder review of [`NL-ENVELOPE-COMPLETION.md`](NL-ENVELOPE-COMPLETION.md),
> received **2026-09-04**, same day. Captured per the standing rule. Sibling:
> [`../fr/FR-FOUNDER-BLOCKER-REVIEW.md`](../fr/FR-FOUNDER-BLOCKER-REVIEW.md), same discipline.
>
> ⛔ **It INVERTS our blocker ranking on structural grounds**, and it finds that one of our blockers
> is scoped against **a repealed regime**. See §1 and §4.
>
> ⚠ Legal citations are the founder's, sourced but **not re-verified by PRYZM**. Two items are marked
> `not-verified` by the founder himself — see §11.

---

## §0 — The boundary

Two things will not become data:

- **BOPA outcomes.** The *buitenplanse omgevingsplanactiviteit* replaced the
  *kruimelgevallenregeling* and is now the route for anything outside the omgevingsplan — a higher
  `bouwhoogte`, for instance. Kennisgevingen run at roughly **400 publications per month**. **The
  trigger is knowable; the decision is a future administrative act.**
- **Roof geometry where the plan genuinely does not fix it.** M5 already proves this is the main path,
  not the exception.

> *"Everything else on your blocker list is either solvable or mis-framed. Three of them
> significantly so."*

---

## §1 — ⭐ THE REFRAME: `voorrangsregeling` is #1, not #6

Our §3 ranked roof geometry first and `voorrangsregeling` sixth as *"NOT BUILT"*.
**That ordering is inverted, and the reason is structural.**

**The mechanism:**
- Since **1 January 2024** every gemeente has an omgevingsplan consisting of the **tijdelijk deel** —
  the old bestemmingsplannen **plus the bruidsschat** — with transition to a permanent plan running to
  **1 January 2032**.
- The Omgevingswet provides that **the tijdelijk deel can only lapse AS A WHOLE.**
- ⭐ **Therefore a gemeente wanting to change anything in it must do so by ADOPTING VOORRANGSREGELS** —
  new rules taking precedence over the older rules from the tijdelijk deel. Adopting voorrangsregels
  is itself a *wijziging* of the omgevingsplan, and gemeenten are obliged to publish such wijzigingen
  via the **LVBB**.
- And the definition that matters: **the regeling is the PRODUCT of the tijdelijk deel and ALL
  successive wijzigingsbesluiten.**

**The consequence:**

> **Our pipeline reads the tijdelijk deel. The overrides live in the wijzigingsbesluiten.**
>
> ⛔ **So `voorrangsregeling` is NOT a missing feature on parcels we currently skip — it is a
> CORRECTNESS RISK on parcels we currently answer CONFIDENTLY, and it grows monotonically for six
> more years.**

Our own note said *"implementing only the intersection produces silent wrong answers."* **It is
stronger than that:** the precedence mechanism is now the **only legal way** to modify the tijdelijk
deel, so it is **guaranteed to exist wherever any gemeente has done anything since 2024.**

⭐ **Until it is built, the honest state of every recovered NL parameter is: *"as at the tijdelijk
deel, overrides not checked."***

---

## §2 — Blocker 8 · DSO — resolve it this week; it is NOT blocking-gated

We marked this `credential-gated, UNRESOLVED`. **It is closer to open than that framing suggests.**

- **Omgevingsdocumenten Presenteren API v8** is **in production**:
  `https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/presenteren/v8/`
  — note the **`/publiek/`** path — with an **API key passed as `x-api-key`**, **freely requestable**
  via the ontwikkelaarsportaal, limit **200 requests/second**.
- v7 was supported to **31-10-2025** and unsupported from **01-02-2026**, so **v8 is the only live
  version**.
- ⭐ **Presenteren supports SPATIAL querying** — search geographically which omgevingsdocumenten and
  which objects apply where. **Verbeelden explicitly does NOT**, and works from `locatieIdentificaties`
  obtained via Presenteren. **The chain is Presenteren (spatial) → Verbeelden (visual detail), not
  either alone.**

**Also in the register and directly relevant:**
- **Omgevingsdocumenten Opvragen** — *"je hebt alleen een API-key nodig."*
- **Geometrie opvragen** — all geometries known to the DSO, by unique geometry identifier.
- **Stelselcatalogus API** — begrippen and definities (see §3).
- **OW-validatieservice** — validates against IMOW. ⭐ **Useful as a conformance oracle for anything
  we parse.**
- **Ruimtelijkeplannen.nl REST API** — the legacy corpus, presumably what we are already on.

> **M6 converts from *"cannot distinguish a small IMOW corpus from a key-gated one"* to a measurable
> question. One key request and one run closes our only open question:** request a key, re-run seed
> `20260903` against Presenteren v8, count.

⚠ **And expect the corpus to move fast: TAM-IMRO ended 1 January 2026**, after which new procedures
must use the *hoofdspoor* under STOP/TPOD. Gemeenten used both up to that date. **Our "zero IMOW
observed" measured a corpus that had a legal escape hatch which has now closed.**

---

## §3 — Blocker 2 · `peil`, 17 definitions — solvable

> *"The 10× correction in §1.4 is the best epistemic moment in the dossier — fixture quoted from the
> sample rather than written by the regex's own author. **Generalise that as a lane rule.**"*

- **Treat the 17 definitions as a CLOSED ENUM, not free text.** We have them. Assign each a reference
  class and keep `peil = AHN elevation` inexpressible — which §2 says we already do. **Then the
  question per plan is a CLASSIFICATION, not an extraction.**
- **Attack via `begripsbepalingen`, which are structurally separable.** Definition articles are a
  distinct block in Dutch plan text — **a much narrower target than the roof-rule leg.**
- ⭐ **Check the Stelselcatalogus.** It serves begrippen and definities as an API; under the
  Omgevingswet the national baseline terms live there. It will **not** give the per-plan `peil`
  definition — that stays in the plan's begripsbepalingen — **but it gives the canonical spellings and
  the national reference set to normalise against, which is exactly what the inflection bug was
  about.**
- **Target the resolvable share, not 100 %.** 17 definitions across a corpus is a bounded
  classification problem, and **`peil-unknown` remains a legitimate typed outcome.**

---

## §4 — ⛔ Blocker 7 · vergunningvrij — we are building against a REPEALED regime

Our §3 item 7 described carve-outs subtracting *"on monuments and in beschermd stadsgezicht."*
**That is the Wabo/Bor framing. Bijlage II Bor LAPSED on 1 January 2024**, and the successor regime is
differently shaped in a way that **changes the design**.

**The current structure:**
- ⭐ **The *knip*.** Technical *bouwactiviteit* and *omgevingsplanactiviteit* are assessed
  **separately**. Vergunningplicht for the technical activity is **Bbl arts. 2.25–2.26**, exceptions in
  **art. 2.27**. OPA rules are **Bbl arts. 2.28–2.31** plus the omgevingsplan itself. **A plan can be
  technically vergunningvrij and spatially vergunningplichtig, or the reverse.**
- **Art. 2.29 Bbl** lists the nationally vergunningvrij OPA cases — vergunningvrij even where the
  gemeente alters the bruidsschat.
- **Art. 2.30 lid 1–2** disapplies them (limited exceptions) for activities in, on or against a
  (voorbeschermd) gemeentelijk, provinciaal or rijksmonument. **Art. 2.30 lid 3** does the same for
  locations carrying the **`functieaanduiding rijksbeschermd stads- of dorpsgezicht` IN THE
  OMGEVINGSPLAN** — the analogue of the old art. 4a Bijlage II Bor.
- **The bruidsschat itself carries vergunningvrije activities** — omgevingsplan **arts. 22.27 and
  22.36**.
- ⭐ **And the decisive one: for *bijbehorende bouwwerken* the national rules NO LONGER APPLY — the
  GEMEENTE determines what is vergunningvrij for the OPA**, and may extend the national list or replace
  vergunningplicht with a *melding* or information duty. Small amendments landed 1 January 2025.

> ⛔ **So the carve-out layer CANNOT be a national rule pack.** It is **national floor (art. 2.29) +
> municipal variation + bruidsschat**, with the exclusion trigger being a **`functieaanduiding`
> QUERYABLE IN IMOW** rather than an external heritage dataset.
>
> **Good news for reachability; bad news for anyone who scoped it as one static table.**

Our brief said carve-outs before the general case. **Still right — but re-scope as: national
art. 2.29/2.30 floor + a per-omgevingsplan overlay, keyed on the functieaanduiding.**

---

## §5 — Blocker 1 · roof geometry — the product decision is right; sharpen the output

`UNDERDETERMINED` as a first-class shippable output is **the correct call**, and §1.5's framing is the
right one.

- ⭐ **Render bounds, AND say WHICH bound.** `bouwhoogte` alone → a prism upper bound. `goothoogte`
  alone → an eaves constraint and **no top**. `dakhelling` from text → closes it. **Three distinct
  output shapes, and the user needs to know which one they are looking at. Make the bound TYPE an
  explicit field.**
- **The 28.8 % text figure is the best-evidenced lever** — same shape as the French `pdf` finding, and
  a **narrower target**: roof rules cluster in the `bouwregels` of a bestemming, so **zone-scoped
  extraction applies**.
- ⚠ **Measure `nokhoogte` in TEXT too.** We report the structured zero but not the text share; **if it
  tracks `dakhelling`, the two together close a lot of triangles.**

---

## §6 — Blocker 3 · `inhoud`, 0 of 556 — probably a SAMPLING ARTEFACT

`inhoud hoofdgebouw maximaal 650 m³` is a real and common Dutch construction, **but it is
characteristically a RURAL / *buitengebied* rule**, applied to dwellings outside built-up areas.

> **A sample drawn tile-uniform or parcel-uniform over the whole country can easily miss it while it
> remains routine in the plans where it appears.**

⛔ **So `missing-source` may be the wrong label.** Before concluding absence, **run a targeted probe on
`bestemming` = agrarisch / wonen in buitengebied plans.** If it appears there, this is a **sampling
artefact, not a corpus absence** — and since it is a **D1-equivalent volumetric cap**, getting it wrong
in the same direction as the withdrawn French D1 claim would be *"an unfortunate rhyme."*

---

## §7 — Blocker 5 · `bebouwingspercentage` denominator — make it REQUIRED

`bouwvlak` versus `(bouw)perceel` **is not a detail**. Where the bouwvlak is a fraction of the perceel,
choosing wrong **scales the footprint by that fraction**.

> *"Given your §1.1 finding that bouwvlak coverage is 11.2 % or 36.7 % depending on denominator, you
> already know denominators are where NL hides its errors."*

⭐ **Cheap fix, real value: make the denominator a REQUIRED field on the parameter, with NO DEFAULT. A
`bebouwingspercentage` without a resolved denominator is `unrecovered`, never silently applied against
the parcel.**

---

## §8 — Blocker 4 · F1 in `wonen` — check two things before calling it terminal

26 land + 49 urban, `wonen` 42, led by plain `"Wonen"` at 32.

- **Is the mechanism in the BRUIDSSCHAT rather than the plan?** Bruidsschat **arts. 22.27 and 22.36**
  carry building rules that arrived **automatically in every omgevingsplan**. If a `"Wonen"` bestemming
  carries no bouwvlak and no height, **the operative rule may be the bruidsschat — national and
  identical everywhere.**
- **Has a wijzigingsbesluit added one?** Same voorrangsregels point as §1.

> ⛔ **If either holds, some of our F1 is really "mechanism present, in a layer we don't read yet" —
> which is `not-built`, NOT F1. Given F1 is defined as a CORRECT NULL, misclassifying here is the
> EXPENSIVE direction.**

---

## §9 — Two upgrades

### §9.1 — Instrument identity is ONE REGELING PER GEMEENTE, not N plans
With the regeling defined as tijdelijk deel **plus all wijzigingsbesluiten**, **B1 should carry the
REGELING identifier and version** — the AKN-style identifiers in the publications, e.g.
`/akn/nl/act/gm.../omgevingsplan/nld@<date>;<version>` — **not just a plan ID from
ruimtelijkeplannen.nl.** ⭐ *"That is the citable, versionable object, and it is what 'Regels op de
kaart' consolidates."*

### §9.2 — Ontwerpregelingen give a forward view, free
The Presenteren API returns a **renvooi** response for draft regelingen, carrying a **delta attribute**
stating what the draft does to the established object — `Toevoegen` and so on. ⭐ **A change-detection
feed for free: a parcel whose governing rule is about to change is a materially different product
answer from one that is stable.**

---

## §10 — The sequence

| # | Move | Why now | Cost |
|---|---|---|---|
| **1** | Request DSO API key; re-run seed `20260903` against **Presenteren v8** | closes M6, our only open question | **days** |
| **2** | **Voorrangsregels** — read wijzigingsbesluiten, apply precedence BEFORE answering | **correctness risk on answers we already give**, growing to 2032 | **~2 weeks** |
| **3** | Denominator as a **required** field on `bebouwingspercentage` | prevents a scale error | **hours** |
| **4** | `inhoud` **targeted probe in buitengebied** | tests whether 0/556 is absence or sampling | **days** |
| **5** | Ship `UNDERDETERMINED` with an explicit **bound-type** field | M5's main path | **~1 week** |
| **6** | `peil` classifier over `begripsbepalingen`, 17-class enum | 70 % of plans currently interpretive | **~2 weeks** |
| **7** | Plan-text leg for roof rules, **zone-scoped** | 28.8 % text vs 0 % structured | **weeks** |
| **8** | Re-scope vergunningvrij: **Bbl 2.29/2.30 floor + per-plan overlay** | current scope targets a **repealed** regime | **~1 week** |

---

## §11 — ⚠ Two things to CHECK before acting (founder-marked `not-verified`)

- **Is the tijdelijk deel served through Ozon/Presenteren, or only through ruimtelijkeplannen.nl?**
  ⭐ **If the DSO serves the consolidated regeling including the tijdelijk deel, moves 1 and 2 COLLAPSE
  into one integration and the whole plan gets cheaper.** Could not be confirmed from the sources
  read — **`not-verified`.**
- **AHN version — is our DSM current?** §2 lists AHN generically; which generation is live, and whether
  a newer acquisition supersedes it, was **not verified**. ⚠ **`peil` disputes turn on centimetres of
  finished ground, so the vintage matters.**
