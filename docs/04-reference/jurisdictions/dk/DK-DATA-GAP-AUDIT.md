# DK DATA-GAP AUDIT — the founder's Denmark master prompt vs the shipped PRYZM Denmark stack

> **Lane DK-DATA-AUDIT, 2026-09-03.** Audits [`DK-ENVELOPE-MASTER-PROMPT.md`](DK-ENVELOPE-MASTER-PROMPT.md)
> (founder-forwarded, ⚠ truncated mid-Part-10) against the code that ships today. Every
> "SHIPPED" claim below is **code-verified this lane** (file paths cited); every "MISSING"
> claim is grep-verified (zero hits recorded where relevant). No production code was changed.
>
> Denmark is PRYZM's **Type-A exemplar** — the one country that DRAWS a cited envelope
> end-to-end, keyless (`region-nordic-baltic-british.md` §Denmark, re-proven 2026-09-02).
> This audit says exactly how far that exemplar is from the master prompt's **nationwide
> defensible buildable-volume engine**, and where the prompt independently re-derives doctrine
> PRYZM already enforces.

---

## §0 · ONE-PAGE VERDICT

**What DK draws today, and under which caveats.** The shipped stack resolves, at a map click:
keyless DAWA parcel (matrikelnr + BFE + registered area) → the 4-rung Plandata ladder
(byggefelt → delområde → lokalplan → ramme, adopted variants only) → the L-449 founder-signed
numeric mapping (`maxbygnhjd` / `maxetager` / `bebygpct` with the **bebygpctaf denominator
honored** — FAR computed only at parcel scope, refused-by-name otherwise) → a byggefelt
footprint where one is PROVEN binding, with the binding-vs-maximum obligation typed
(`DK_BYGGEFELT_OBLIGATION_OWED`) → an honest cited refusal (`dkPlandataRefusal.ts`) where the
numbers live in the plan PDF. Two live never-overstate gate arms (Nørrebro af=4 must compute;
Aarhus af=1 must withhold) pin the denominator branch.

**The caveats that stand between that and the master prompt's engine:**

1. **It is a PLANNING envelope, not a defensible LEGAL envelope.** Of the master's 20
   determinations, the shipped stack delivers ~7 (land, plan instruments, structured plan
   constraints, footprint, height, storeys, floor area at parcel scope) and delivers them
   honestly. It delivers **zero** of: environmental/statutory overlays, cadastral/private-law
   (servitudes), existing buildings/cases (BBR), terrain/niveauplan, roof geometry, the
   deterministic-vs-conditional partition, or as-of-date evaluation.
2. **Adopted-plans-as-of-now only.** `_vedtaget` variants; no forslag/aflyst, no
   kommuneplantillæg, no temporal version graph, no "at a specified date".
3. **Structured-fields-only, with one honored honesty flag and one un-honored one.**
   `kompleks` is mirrored verbatim; **`iomfangreg` ("structured fields do NOT fully represent
   the regulation") is read nowhere** — a live never-overstate risk (§1.2 below).
4. **BR18 by-right law is data, not rules.** The §168–186 defaults exist as a ladder rung
   *description*; det skrå højdegrænseplan, naboskel distances and niveauplan are corpus-absent
   (grep 0), and the inclined plane is not even representable (prism-only schema) — the flat
   `maxbygnhjd` prism **can overstate near boundaries** (matrix-north C4-DK).

**Ranked build list (detail in §2):** ① mint + deploy the Datafordeler API key (hours,
FOUNDER — unlocks already-written keyed legs) · ② honor `iomfangreg`/`tillagtosh` on the
structured route (days, US — correctness) · ③ BR18 extraction: skrå højdegrænseplan +
naboskel + niveauplan datum seat (US + FOUNDER sign-off; the inclined-plane primitive is the
region's highest-leverage kernel item) · ④ kommuneplantillæg temporal graph + as-of-date
(US) · ⑤ BBR ingestion (US/DATA) · ⑥ environmental-overlay framework with the
EXCLUSION/CONDITIONAL/SCREENING/INFORMATIONAL classification (US + DATA) · ⑦ zonekort +
landzonetilladelser (DATA/US) · ⑧ heritage FBB (DATA) · ⑨ road building lines / byggelinjer
feed (DATA — machinery already engine-wired) · ⑩ aviation OLS with the legal-elevation
UNKNOWN caveat (DATA) · ⑪ DK4 semantic kommuneplan + retningslinjer dictionary (US, large) ·
⑫ DAR address-input + EBR/SFE property composition (US — SFE upgrades the af=2 refusal to a
number) · ⑬ Retsinformation corpus (US, large) · ⑭ LER (gated, low for envelope) ·
⑮ Tinglysning servitudes (credential-gated, FOUNDER).

**The 31 source categories (master Part 2), wired-vs-none:** **ANY wired coverage: 5–6 of 31**
— cadastre (A: DAWA live + Datafordeler MAT coded-but-unkeyed), property (B: BFE number only,
via DAWA), address (C: partial — parcel-at-point; no address→BFE resolution), planning (D:
live, the exemplar), topography (GeoDanmark: context-bake heights, live) and terrain (DHM:
context nDSM live; per-parcel terrain for envelope NOT wired). **The other ~25 have ZERO wired
coverage** — BBR, environment, nature, water, flood, coast, roads, road building lines, rail,
aviation, heritage, archaeology, contamination, groundwater, utilities/LER, servitudes,
building permits, dispensations, landzone permissions, legal text, court decisions, historical
data, digital municipal plans, municipal GIS — though many have paper-level rows in
`DENMARK-GEOSPATIAL-DATA-INVENTORY.md` (`VERIFIED-PRIMARY ⚠ re-probe`, i.e. researched, never
probed, never wired).

---

## §1 · ALREADY SHIPPED — item by item, code-verified

### 1.1 Matriklen: which Datafordeler generation is our leg on? (master R3)

- **`server/jurisdiction/dkMatrikelProxy.js`** is on the **CURRENT entity-based WFS
  generation**: `https://wfs.datafordeler.dk/MAT/MAT_WFS/1.0.0/WFS`, auth = `&apikey=` query
  param, entities `mat_v001:lodflade_current` (geometry) + `mat_v001:jordstykke_current`
  (attribute join for matrikelnummer). The retired legacy (`services.datafordeler.dk/MATRIKLEN2`,
  Basic-Auth Service User) was **probed dead 2026-07-24 and rewritten off** — the forensic
  record is `findings/DENMARK-DATAFORDELER-AUTH-2026.md` (legacy WFS closed 1 Jul 2026;
  Service/Web users fully off 15 Jan 2027). So R3's "never build on retiring legacy" is
  **already satisfied for the OGC leg**.
- **But R3's TARGET generation — GraphQL + file download + schema/version pinning + history —
  is not adopted anywhere.** No GraphQL client, no bulk-download/backfill leg, no
  `MatrikulaerSag`/history access. Of the master's 15 Matriklen entities we touch exactly
  **2** (`Lodflade`, `Jordstykke`). `SamletFastEjendom` (the property composition) is absent —
  which is precisely why the af=2 (per-ejendom) denominator today *refuses* instead of
  computing (§3).
- **Keyless fallback (L-12888):** when `DATAFORDELER_API_KEY` is unset, the proxy serves the
  real parcel from keyless DAWA `jordstykker` (live-verified polygon + matrikelnr + BFE +
  registreretareal). The key **upgrades** attributes; it no longer gates Danish parcels.
- ⚠ **Registry/proxy tension to reconcile:** `sourceRegistry/dk.ts` row
  `dk-datafordeler-matriklen-wfs` still says the gate is "ADMIN bootstrap requires MitID —
  unobtainable (L-449 founder-ruled 2026-07-30)" and `adapterStatus: 'deferred-stub'`, while
  the proxy's own comment (and the 2026 auth finding) says a **free API key is mintable at
  portal.datafordeler.dk → IT-system → API-nøgle**. Two contradictory statements about the
  same gate; the proxy is the newer one. Resolve at key-minting time and correct the row.

### 1.2 Byggefelt: which of the master's fields do we read TODAY? (master §4.2)

Read and **honored** (code sites in parentheses):

| Master field | Shipped? | Where / how honored |
|---|---|---|
| `vejledende` (bygvejledende) | ✅ **HONORED** | single classifier `evidence/byggefeltEvidence.ts::classifyByggefeltLegalStatus`; mirrors into R5 `normativeForce` (`dkRuleMapper.ts`); advisory field = `maximum` upper-bound semantics, never a definitive footprint (`dkByggefeltBinding.ts`, `§BYGGEFELT-BINDING-GATE` in `dkEnvelopePlacement.ts`) — the master's R7 exactly |
| `kunifelt` (bygkunifelt) | ✅ **HONORED** | binding=true → `binding-obligation` (a MIN, never-understate; `DK_BYGGEFELT_OBLIGATION_OWED` records the frozen-schema debt — no `footprintIsRequired` seat yet); proxy `isBindingFootprint` requires `bygkunifelt=true AND bygvejledende!==true`; conflict (both true) and null flags → `not-placeable` (`§NULL-IS-NOT-FALSE`) |
| `kompleks` | ✅ **HONORED** | mirrored **verbatim** as a boolean rule, true = "rules too complex to structure — PDF-only, read doklink" (`dkRuleMapper.ts` deliverable 4; served false ≠ absent) |
| `tillagtosh` | ❌ **NOT READ** | grep over packages+server+gates → **0 hits**. The field-GFA vs higher-level floor-area interaction is unresolved |
| `iomfangreg` | ❌ **NOT HONORED** | **1 hit, and it is a diagnostic string** (`dkEnvelopePlacement.ts:385` — "resolve by DescribeFeatureType-probing bygvejledende / iomfangreg…"). The mapper never reads it, so a feature declaring "the structured fields do NOT fully represent the regulation" is consumed as if they do. **This is a live never-overstate hole** — rank #2 in §2 |
| `eareal` | ✅ read | `dkByggefeltBinding.ts` `maxGfaM2` (a FACT, never a default) |
| `maxbhjd`/`maxbygnhjd`, `maxetage`/`maxetager` | ✅ read | through the L-449 signed mapping `resolveDkPlanEnvelope` (storeys floored, never overstated) |
| `planid`/`lokplan_id`, `delnr`, `status`, dates (`datovedt`/`datoikraft` as YYYYMMDD ints), `doklink`, `lp_plannr`/`lp_plannavn` | ✅ read | plan identity, R3 validity, citations (`dkRuleMapper.ts`, `dkByggefeltCitation`) |
| `versionsnr`, `sforhold`, `nedbrydsf`, `ianvreg`, `izonereg`, `iudstykreg`, `kbeskriv`, `anvspec*`, `earealh*`, `boligenhed*`, `maxvind*` | ❌ not read | grep 0 (except comments) |

The geometry side is stronger than the attribute side: 57,080 byggefelter nationally,
multi-part (19.4%) + holes (1.2% — "a hole is a published DO-NOT-BUILD-HERE, carried never
dropped") handled bespoke in `geometry/explicitArea.ts`.

### 1.3 Kommuneplanramme: do we resolve the area-basis codes? (master §4.3 CRITICAL)

**YES — this is the single strongest convergence between the master prompt and shipped code.**
The master's "NEVER calculate volume/floor area before the denominator is resolved" is the
shipped C63/L-449 discipline, end to end:

- `bebygpctaf` is read as a **closed state codelist** {1,2,3,4} (L0 vocabulary
  `@pryzm/schemas` `vocabularies/dk.ts`); a fifth code **fails the mapping by name**, never
  absorbed (`dkRuleMapper.ts`).
- `dkDensityScopeFromBygberegnaf` (`rulepacks/dkPlandataEnvelope.ts`): 1 "området som helhed"
  → planningArea, 2 "den enkelte ejendom" → property, 3/4 → parcel.
- The **only** arithmetic branch (`countryAdapters/dk/dkGfa.ts::deriveDkGfaFromBebygpctRule`)
  requires basis present + scheme owned + code parcel-scoped; every other case **refuses
  naming the basis** (`basis-planning-area` / `basis-property` / `basis-not-served` /
  `value-unknown` …). "The wrong-number path is structurally DEAD."
- **Withhold on unresolved basis: yes** — `bebygpctaf` not served ⇒ FAR withheld
  (`scope-unknown`), the pct rides as a FACT, height/storeys pass through (absolute caps).
  UNKNOWN is never read as 'parcel'.
- **Gate-pinned:** `tools/ga-gate/check-envelope-never-overstates.ts` `§DK-DENOMINATOR-LIVE`
  drives two RECORDED live chains — Nørrebro (af=4) must compute; Aarhus ramme 010109CY
  (af=1, bebygpct 180) must withhold, with a teeth-check that the pre-fix naive per-parcel
  multiply would have surfaced.
- **Not read on the ramme:** `bebygpctar` (the master lists it beside `bebygpctaf`),
  `eareal`/`earealh`, **`m3_m2`/`m3_m2h` (the volume-per-m² axis — determination 13's most
  direct Danish source)**, `boligenhed`, zone/future-zone. National fill measured: bebygpctaf
  served on ~99.8–100% of populated bebygpct; parcel-scoped codes only 15.2–28.1% by layer —
  i.e. the honest-refusal branch is the COMMON branch nationally.

### 1.4 BBR / DAR / EBR / GeoDanmark / DHM: wired at all?

| Master part | Wired? | Evidence |
|---|---|---|
| **3.4 BBR** | ❌ **NO** | zero ingestion code; named only in comments ("buildings come from BBR/GeoDanmark behind the Datafordeler key") and as an inventory row (`VERIFIED-PRIMARY ⚠ re-probe`). DAWA's `bygninger` endpoint was probed and **rejected** (200-empty at central CPH — "an unreliable empty is worse than a gate", `dkParcelProvider.ts`) |
| **3.2 DAR** | 🟡 **partial, sideways** | no address-resolution chain (address → access address → BFE); input today is a map-click point. But DAWA `jordstykker` serves **BFE** + kommune + ejerlav on the parcel (`dkParcelProvider.ts` `bfe`), so the property spine's *number* is held |
| **3.3 EBR** | ❌ **NO** | zero hits |
| **3.5 GeoDanmark** | ✅ **wired for context** | `tools/context-bake/heightSources.mjs` `geodanmark`: `gdk60:Bygning` footprints (which carry NO scalar height — verified against the objekttypekatalog) + DHM nDSM P90 over the eroded footprint = LoD1 heights, `DATAFORDELER_API_KEY`-gated, coverage full, impl live. Correctly used as **physical context, never legal geometry** — the master's own 3.5 rule |
| **3.6 DHM** | 🟡 **context only** | nDSM via the same leg; terrain WCS probed (`tools/context-bake/terrain.mjs`, token verdict). **NOT wired as per-parcel terrain/slope/cross-sections for the envelope**, and the physical-vs-legal split (R5) has no DK instantiation: `niveauplan` → **grep 0** (matrix-north C-DK; DHM open but unwired for envelope, L-383c OPEN) |

### 1.5 The rest of the shipped DK surface (for completeness)

- **Honest refusal vocabulary** — `rulepacks/dkPlandataRefusal.ts` (`§DK-HONEST-REFUSAL`):
  plan resolved but numbers in the PDF ⇒ reasoned, cited refusal naming the plan + doklink;
  never the generic 3/1.5/12 estimate.
- **Precedence machinery** — rank as FACT (`{scheme:'dk-plan-ladder', level}` 1–4 per rule),
  resolution engine-side (`evaluateDeclarative` min-level + `conflicted-rank` refusal on
  ties). Matrix-north C-DK: **PASS** — supersession-by-instrument live and refusal-correct.
- **BR18 rung 5** — `DK_APPLICABILITY_LADDER` records the §168–186 statutory defaults as a
  DERIVED step description ("not a WFS layer and not minted as one") — data, not yet rules.
- **Axis-order hedge** — the lat,lon bbox returns 0 features SILENTLY (HTTP 200); both the
  proxy and the node client hedge both orders before concluding `absent`.
- **Source registry** — `sourceRegistry/dk.ts`: 4 rows (plandata-wfs live · dawa-jordstykker
  live · datafordeler-geodanmark live · datafordeler-matriklen deferred-stub), dated probe
  logs, endpoint drift-guard at module load (`dkSources.ts`).
- **FetchOutcome discipline** — empty ≠ failure end-to-end; tier-6 UNKNOWN rows visible
  (fill 30.6/43.1/60.8% by layer), UNKNOWN ≠ 0 ≠ no-limit.

---

## §2 · THE MISSING PIECES — ranked (owner · effort)

Owners: **US** = build work · **DATA** = source verification/sourcing · **FOUNDER** =
decision/credential/sign-off. Ranked by (defensibility gained ÷ effort), correctness holes
first.

1. **Datafordeler API key minted + deployed** (FOUNDER · hours). The keyed legs are ALREADY
   CODED (Matrikel survey-WFS + attribute join; GeoDanmark/DHM heights). Verify the
   registry-row-vs-proxy gate contradiction (§1.1) at the same time and correct
   `sourceRegistry/dk.ts`.
2. **Honor `iomfangreg` + `tillagtosh` on the structured route** (US · days). `iomfangreg=true`
   must gate/caveat the structured numbers (the register itself says they are incomplete) —
   today it is a comment; `tillagtosh` must be resolved before a field-GFA and a plan-level
   floor-area rule are ever combined. Both are never-overstate/never-understate correctness,
   the same class the DK-BINDING lane closed for `bygkunifelt`.
3. **BR18 versioned rules — the by-right layer** (US + FOUNDER sign-off, mirroring L-449):
   (a) **det skrå højdegrænseplan** (height ≤ 1.4 × distance to naboskel/vej) — grep 0, and
   the prism-only `EnvelopeTierSchema` cannot represent it: needs the **inclined-plane /
   height-field kernel primitive** (shared with DE §6 Abstandsflächen — the region's stated
   highest-leverage item; today the flat prism can OVERSTATE near boundaries);
   (b) **naboskel boundary distances** — "cheapest cell": the `setback` kind +
   `insetPolygonPerEdge` exist, only the extraction is missing;
   (c) **niveauplan** — one fixed datum plane per site, geometrically the easiest datum case;
   needs the `datum` schema seat (the Madrid `facadeRasantDatum` pattern generalized to pack
   data) + R5's separate `physical_terrain_reference`/`legal_height_reference`. The master's
   5.2 `height_reference` RULE is exactly this.
4. **Kommuneplantillæg temporal graph + as-of-date evaluation** (US · 1–2 wk). Today:
   adopted-variants-only, latest-known-plan correctness. R3 validity fields already carry
   `valid_from`; the missing halves are the tillæg instrument, the version graph
   (never newest-wins), and an evaluation date parameter ("at a specified date" is in the
   master's objective sentence). Plandata's `_forslag`/`_aflyst`/`_med_historik` variants are
   the identified source (matrix-north D4).
5. **BBR ingestion** (US + DATA · 1–2 wk once keyed). Determination 7 (existing buildings /
   cases / permits) has zero coverage. R6 discipline (registered state ≠ future rights) is
   already repo doctrine — ingestion is the gap, not philosophy. Also the cross-check axis
   (nDSM height vs BBR floor count) the inventory doc already designs.
6. **Environmental-overlay framework + classification** (US framework + DATA per layer ·
   framework ~1 wk, layers incremental). Part 6's EXCLUSION / CONDITIONAL / SCREENING /
   INFORMATIONAL classification does not exist as a type; no Miljøportal/Arealdata layer is
   wired. The refusal/legal-effect vocabulary is the natural home; R8's CONDITIONAL-volume
   class (never added to deterministic) needs a schema seat.
7. **Zonekort + landzonetilladelser** (DATA + US · days). Only the `zonestatus` attribute on
   plan features is read today (an overlay tag in `mapPlandataToZoningRecord.ts`); no zonekort
   dataset, no landzone permissions. Honor "landzone ≠ automatic no-build" (it is R8
   CONDITIONAL, not EXCLUSION).
8. **Heritage FBB** (DATA · days). Zero coverage (`fredning`/`fortidsminde` grep 0); the
   inventory has the row. Keep the master's four-way separation (building-protected vs
   parcel-affected vs buffer vs planning designation).
9. **Road building lines / the byggelinjer WFS feed** (DATA · small). The offset machinery is
   shipped and engine-wired (`geometry/buildingLineOffset.ts` + `dkEnvelopePlacement.ts`,
   matching lines to parcel edges without inventing front/side/rear); the missing piece is the
   dataset feed itself (schema unverified). Never a generic fixed width — already doctrine.
10. **Aviation OLS** (DATA · days). Zero coverage. Implement WITH the master's caveat: surface
    geometry without a legal elevation ⇒ `AVIATION_HEIGHT = UNKNOWN/CONDITIONAL` — which is
    exactly the shipped tier-6 UNKNOWN pattern applied to a new axis. Rail: screening +
    approval-requirement only, never an invented national setback.
11. **DK4 digital kommuneplan semantic layer + retningslinjer theme dictionary** (US · large,
    multi-week). Nothing shipped. The master marks DK4 PRIORITY as the long-term semantic
    layer (`Plan → Theme → Content → GeographicArea → LegalRef → EffectivePeriod`, never
    flattened to text); the national retningslinje theme-code dictionary is its prerequisite.
12. **DAR address input + EBR/SamletFastEjendom property composition** (US · ~1 wk). Address /
    BFE / cadastral-designation as INPUTS (today: coordinates only). SFE is the direct upgrade
    path for the af=2 refusal: with the ejendom's parcel set held, "property-scoped"
    bebyggelsesprocent becomes computable instead of refused — a refusal deleted by data, the
    best kind.
13. **Retsinformation legal corpus** (US · large). `retsinformation` grep 0. Law → section →
    paragraph → effective-period as versioned objects; prerequisite for #3's rules to be
    citation-versioned rather than transcribed. Never unversioned constants — matches the
    existing "no hardcoded laws" posture (L-449 packs carry citations + review dates already).
14. **LER utilities** (DATA/FOUNDER · gated). Grave-request workflow with professional-purpose
    auth; `UTILITY_CONSTRAINT` is feasibility, not envelope law — LOW priority for the
    buildable volume. Verify the OpenAPI + auth class before classifying further (R2).
15. **Tinglysning servitudes** (FOUNDER · gated — verify honestly). Part 10 is the truncated
    part; classify with the identity-bootstrap pattern (SE/DK cadastre precedent,
    `identity-bootstrap-gate-offline-legislation-pattern`): the official system-to-system API
    historically requires MitID/NemID-class identity + agreements. **Not yet probed — treat
    the gate as UNVERIFIED until a dated probe exists**; expect: offer the deterministic
    envelope with a named "servitudes unresolved" caveat (determination 18) rather than
    pretending private law was checked.

---

## §3 · CONVERGENCES — where the master prompt independently re-derives shipped doctrine

Named explicitly, because they are evidence the two were derived from the same reality, not
from each other:

1. **R4 (DATA ≠ LEGAL EFFECT, per-constraint evidence trail) ≡ the R-batch provenance shape.**
   Every shipped DK rule carries source/authority/dataset/plan_id/object_id/document/
   derivation/valueLocation/confidence-tier/validityBasis/valid_from
   (`SiteIntelRuleSchema`, `dkRuleMapper.ts`) — the master's field list, already typed at L0.
2. **R7 (INDICATIVE ≠ BINDING, vejledende) ≡ the DK-BINDING lane.** `bygvejledende` →
   `normativeForce`, the single classifier, `§BYGGEFELT-BINDING-GATE` ("vedtaget = adopted ≠
   binding"), advisory = upper-bound-study never a footprint, and the never-understate dual
   (`bygkunifelt` = MIN obligation, `DK_BYGGEFELT_OBLIGATION_OWED`). The master's 4.2
   semantics table is a paraphrase of shipped code.
3. **The §4.3 denominator criticality ≡ C63.** "NEVER calculate before the denominator is
   resolved" is the C63 buildable-land discipline and the L-449 `densityScope` machinery
   verbatim — down to the same worked example class (the Aarhus af=1 "området som helhed"
   trap), and it is GATE-pinned (`§DK-DENOMINATOR-LIVE`). The master prompt independently
   names the one Danish field PRYZM already refuses on.
4. **R5 (physical ≠ legal niveauplan) ≡ ADR-0377 datum doctrine + L-584** ("terrain/rasant is
   a LEGAL defect" — sample the ordinance's reference, not the DHM centroid). Doctrine shipped
   (Madrid `facadeRasantDatum`); the DK *instantiation* (niveauplan seat) is gap #3c — the
   prompt confirms the priority, not the design.
5. **R8 (CONDITIONAL ≠ ALLOWED) ≡ the refusal architecture.** `EnvelopeRefusal` with
   `legallyGrounded` + coded reasons, "refusal ≠ failure ≠ empty" (§CONTEXT-DATA-HONESTY),
   and the never-overstate gate family. What R8 adds that is genuinely new: a first-class
   **CONDITIONAL volume** alongside deterministic — today PRYZM refuses or draws; it does not
   yet draw a labeled conditional layer.
6. **R2 (never invent an endpoint) ≡ probe-don't-assume.** Dated live probes on every
   `sourceRegistry/dk.ts` row, the endpoint drift-guard failing the build on disagreement
   (`dkSources.ts`), DescribeFeatureType-verified field names ("the WFS SHORT names are what
   the ingestion actually emits — NOT the long legal names", `dkPlandataEnvelope.ts`).
7. **R6 (existing ≠ permitted future) ≡ standing doctrine** — moot only because BBR is
   unwired; the DAWA-bygninger rejection shows the reflex is live.
8. **`kompleks` routing (§4.2) ≡ shipped verbatim-mirroring** — "true = rules too complex to
   structure, PDF-only" is already a first-class rule, and the honest-refusal path is exactly
   the master's "route to document/legal interpretation".
9. **"Output never implies certainty" ≡ tier-6 UNKNOWN visibility** — UNKNOWN ≠ 0 ≠ no-limit,
   refusals cite what IS known as facts (bebygpct rides as a fact even when FAR is withheld).
10. **R3 (current vs legacy) ≡ the 2026 auth migration already executed** for the one keyed
    leg PRYZM touches (`DENMARK-DATAFORDELER-AUTH-2026.md`) — with the honest residual that
    the GraphQL/file-download target generation is future work (§1.1).

**Net:** the master prompt's Parts 1 and 4.2–4.3 are ~80% *already enforced in code*; its
Parts 3.3–3.4, 4.4–4.9, 5–10 are ~95% *unbuilt*. The prompt's real contribution is the
breadth axis (the 31 categories and the 20 determinations), not the honesty axis — the
honesty axis it re-derives is the one PRYZM already ships.
