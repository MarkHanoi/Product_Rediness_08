# NL DATA GAP AUDIT — the founder's master prompt vs PRYZM's shipped NL stack

**Lane NL-DATA-AUDIT · 2026-09-03 · read-only audit, no code changed.**
Subject: `NL-ENVELOPE-MASTER-PROMPT.md` (founder-forwarded external research, same directory)
audited against the LIVE NL leg (`packages/site-parcel-data` + `apps/editor/src/ui/site/siteDispatch.ts`
+ `server/jurisdiction/nlBestemmingsplanProxy.js`), the K1/S1 kernel work, the 2026-09-02
envelope-architecture audit (`audit/envelope-architecture/2026-09-02/`), and
`docs/01-strategy/envelope-gap-master/region-central-eu.md` NETHERLANDS block.

---

## 0 · ONE-PAGE VERDICT

**What NL draws TODAY, honestly:** a nationwide, keyless, founder-signed (SIG-NL1, 2026-08-26)
L1 envelope — the published `bouwvlak` polygon (all parts, all courtyard holes, L-12896 closed)
× the published `maximum bouwhoogte`, `structured` when both resolve; degrading to the zone
(`bestemmingsvlak`) extent as a labelled UPPER BOUND (`estimated-ruleset`) when no bouwvlak is
published (the common case); refusing with a cited, retry-honest refusal otherwise. Its honest
caveats, all machine-emitted today: (1) **legacy layer only** — the leg reads the PDOK
Ruimtelijke-plannen WMS (Wro/IMRO mirror), not the DSO/Omgevingsplan; (2) **overlays carried,
not consumed** — dubbelbestemmingen and paraplu plans are named in a mandatory caveat but never
subtracted; (3) **roof = prism to bouwhoogte** with the goothoogte caveat ("above X m the true
envelope is at most what is shown"); (4) **Z-bottom is the local authoring ground plane** — no
peil, no NAP, no terrain in the legal path, no `HeightDatum` stamped (reads as `unknown`);
(5) **no `as_of_date`** — the proxy picks most-authoritative-status-then-newest, which is
"today", not a date.

**What the master prompt adds that we genuinely lack** (ranked build list, §2): the DSO
Presenteren v8 modern leg (blocked on the free API key — the ONE standing unblock the region doc
already names), overlay-stack subtraction, peil/begripsbepaling extraction, `as_of_date`
temporal selection, roof-determinacy status, `inhoud`, the vergunningvrij layer + carve-outs,
the bebouwingspercentage denominator scope, voorrangsregeling as an operation, and the F1/F2
refusal split.

**What we must MEASURE before building (Phase 0, §3):** M1, M2 and most of M5 are runnable
TODAY on shipped machinery (BRK sampling + the WMS proxy + a raw-`naam` tally); M3 runs today
but reports in our vocabulary (the A–F splits we lack are themselves findings); **M4 and M6
cannot be measured without the DSO key** — filing that free form is the highest-leverage single
action in this entire audit.

**Where the two designs agree (§4):** the master prompt independently re-derives PRYZM's four
deepest doctrines — the human signature gate (L-449/ADR-0283), the five-answer refusal
distinction (§CONTEXT-DATA-HONESTY), extraction-once/deterministic-runtime (C58), and the
inclined-plane primitive (§7.6 = ADR-0378 + `inclinedTop.ts`, already landed). The founder can
read §4 as external validation of the shipped architecture.

---

## 1 · ALREADY-SHIPPED vs the master prompt, item by item

### 1.1 Which API does our NL leg use? (master §3)

**The legacy layer, via the PDOK mirror — not DSO v8 and not RP-API v4.** The live route is
`server/jurisdiction/nlBestemmingsplanProxy.js` → PDOK **"Ruimtelijke plannen" WMS v1_0**
(`service.pdok.nl/kadaster/ruimtelijke-plannen/wms/v1_0`), keyless `GetFeatureInfo` over four
layers (`bestemmingsplangebied`, `enkelbestemming`, `bouwvlak`, `maatvoering`), consolidated
server-side and parsed by `providers/resolveNlBestemmingsplan.ts`. Both authoritative DSO APIs
are registered and **blocked** (`sourceRegistry/nl.ts`): `nl-dso-ozon-presenteren-v8`
(Presenteren v8.5.2 — typed NormSpec/NormwaardeSpec objects, probed 2026-08-31, openapi keyless,
data endpoints 401 without `x-api-key`) and `nl-dso-ruimtelijke-plannen-v4` (same key regime).
The gate on both is the **free DSO API key form** — a form, not a procurement. Master §3's
warning about the retired old-Download-API geometry endpoints does not bite us (we never built
on them), but M6 (legacy split) is unmeasurable from the WMS mirror alone.

- Parcels: **BRK via PDOK WFS v5_0** (`nl-pdok-brk-kadastralekaart-wfs`, live, `pdok-nl`
  provider). Master §3's "cadastral map is INDICATIVE, never survey-grade" is not yet a stamped
  caveat on our parcel provenance — minor gap.
- AHN: **absent** from the legal path entirely. BGT: probed live (49 collections), adapter
  `documented`, unconsumed. BAG/3DBAG: live for as-is context (`nl-3dbag-ogcapi`), correctly
  never used as entitlement.

### 1.2 What maatvoering does it read? (master §2/§7.4)

`classifyMaatvoering` is a **closed 5-kind vocabulary**: `max-bouwhoogte`, `max-goothoogte`,
`max-aantal-bouwlagen`, `max-bebouwingspercentage`, `fsi`. So: **yes, goothoogte is read** —
typed, carried for provenance, deliberately never used as the height cap, and since matrix-west
D5 the eave-vs-ridge gap ships with a user-facing caveat (§NL-GOOTHOOGTE-CARRY,
`siteDispatch.ts:3484-3499`). **Not read:** `dakhelling`, `nokhoogte`, `nokrichting`, `kap`,
`inhoud` — the caveat says so explicitly ("the dakhelling maatvoering is not read on this
route"). The `min`-guard (a `minimale` maatvoering is refused as a max) and the
never-fabricate-0 rule are exactly master §1's "never invent a constraint", already enforced.

### 1.3 as_of_date? (master §5B)

**No.** The proxy's governing-plan pick (`pickGoverningDossier`) is
most-authoritative-status (`onherroepelijk`/`geconsolideerd` > `vastgesteld` > `ontwerp`) then
most-recent `datum` — a defensible "what governs today" heuristic, and precisely the
"simply newest" strategy §5B forbids for dated queries. The SEATS exist elsewhere in the stack
(`Scenario.asOfDate`, `isInForceOn`, `ruleSetVersion`, the legal-vs-ingestion `validityBasis`
split — audit T1 rows B1/F6, judged STRONGER than the reference); the NL leg simply does not
consume them.

### 1.4 Overlays? (master §5C)

**Carried, never consumed — the audited D4 finding, now honestly caveated.** The proxy
deliberately picks the governing dossier from the substantive layers to route AROUND thematic
paraplu plans (`nlBestemmingsplanProxy.js:195-207` — correct, mixing values across plans would
fabricate a rule nobody adopted), and **never queries `dubbelbestemming`** — nor
`gebiedsaanduiding`, `functieaanduiding`, `bouwaanduiding`, `figuur`. Since the D4 fix the drop
is a MANDATORY static caveat on every NL envelope (§NL-OVERLAY-CARRY, `siteDispatch.ts:3500-3514`,
per the RASE mandatory-carry doctrine). Schema-side, `ZoningRecord.overlays` is an unordered
string array consumed by nothing in the solve path (audit T1 B4), and overlay conflict ORDER is
declared nowhere (E3). Master §5C demands subtraction; the geometry to do it —
`polygonDifference` (§K1-POLY-DIFFERENCE, oracle-pinned, the NL courtyard exact carve
9,099.86 + 0.14 = 9,100.00 m²) — is already on disk. The missing piece is data plumbing plus an
ordered overlay model, not a primitive.

### 1.5 Voorrangsregeling? (master §5D)

**No distinct precedence operation exists.** The dossier pick is plan SELECTION, not conflict
resolution between simultaneously-binding instruments. The fact seat exists
(`RuleApplicability.rank` + refuse-on-tie doctrine, audit E3) but nothing NL consumes it.

### 1.6 Peil, and what the drawn NL envelope assumes for Z_bottom TODAY (master §7.1)

**There is no peil resolver; the honest statement of today's behavior:** the NL prism rises
from the parcel's **authoring-frame ground plane**. Terrain exists display-side only — "PRYZM
holds no terrain model" in the legal path (audit A5) — and the NL leg stamps **no
`HeightDatum`**, so ADR-0377's total-read helper reports it as `unknown`. The draw does not
refuse on `unknown` (the leg predates ADR-0377; only the declarative `heightDatumResolver`
refuses). Net: **Z_bottom = local ground at the parcel, implicitly "peil = maaiveld, flat"** —
defensible on flat Dutch urban parcels, but an ASSUMPTION the output does not currently name,
which is the one place the NL leg is silent where the master prompt (and our own ADR-0377
doctrine) demands it be loud. Master §7.1's ladder — begripsbepaling extraction → referenced
physical points → AHN/BGT/BAG as evidence → `legally-bounded-datum-unresolved` otherwise — maps
1:1 onto the ADR-0377 model (`unknown` is our spelling of `datum-unresolved`); the NL wiring is
the gap, not the model.

### 1.7 Bebouwingspercentage denominator (master §7.2)

`readMaatvoeringen` converts the % to a 0..1 ratio and ships it in `maxCoverage` with **no
denominator scope** — bouwvlak vs bouwperceel is not represented. The repo already invented
the cure for exactly this class of bug elsewhere: `valueBasis` on provenance (the DK
denominator fix, audit D1). Extension, not invention. We do NOT auto-interpret an omitted
percentage as 100 (absent → null), which satisfies the second half of §7.2 already.

### 1.8 Bouwvlak ≠ buildable footprint (master §7.3), roof (§7.4), inhoud (§7.5)

- §7.3: **partially modeled.** We distinguish bouwvlak (precise) from bestemmingsvlak (upper
  bound) — a two-member slice of the master's three-part model. The ancillary layer
  (bijbehorende bouwwerken legal OUTSIDE the bouwvlak) has no seat; today those rights are
  silently absent from the envelope (an UNDERSTATE, the safe direction, but unnamed).
- §7.4: **the two-limits-not-a-roof insight is half-honored.** We never build a roof plane
  from goot+bouw (good — the master's "never a triangle" fixture would pass); but we draw the
  full prism to bouwhoogte and carry the wedge as prose caveat rather than a typed
  `roof_geometry_status = UNDERDETERMINED` with bounds. The drawn solid overstates the
  eave-to-ridge wedge, named but not typed.
- §7.5: **no `inhoud` at all** — not in the classifier, no volumetric test. The machinery to
  test V(x) ≤ V_max exists (`solveInclinedTop` computes exact ∫∫h dA volumes in closed form);
  the constraint kind does not.

### 1.9 Inclined planes (master §7.6), four tiers (§4), vergunningvrij (§8), parsing (§12)

- §7.6: **LANDED** — `geometry/inclinedTop.ts` (§K1-INCLINED-TOP) + ADR-0378, the min-over-
  affine-planes height field with exact volumes and inscribed (under-stating) tiers, built
  explicitly to serve "DK skrå højdegrænseplan, DE Abstandsflächen, Paris crown, ES coronación,
  **NL dakhelling**". One honest delta: the **molenbiotoop is a RADIATING surface around a
  point** (h = a + b·r); `InclinedPlaneSpec` is line-anchored. A point-anchored (conical)
  variant is a small extension of the same primitive, not a new engine.
- §4: **not modeled.** We read one tier (municipal plan). Bkl, provinciale
  omgevingsverordening, and the vergunningvrij layer have no representation; Bbl is correctly
  absent (the master agrees it stays out of the spatial envelope).
- §8: **nothing** — no achtererfgebied/bebouwingsgebied computation, no monument/beschermd-
  stadsgezicht carve-outs, no RCE data source registered.
- §12: **precedent exists, NL instance does not.** The compositional-grammar,
  parse-once-offline-signed, runtime-evaluates design is exactly the shipped Madrid SPACM
  grammar stack (`esMadridSpacmGrammar.ts` + schema + validate + routing guard). The NL leg
  never needs to parse prose TODAY because SVBP2012 serves typed numbers — the grammar becomes
  necessary the day we read plan `regels` text (peil §7.1, conditions §7.8, precedence §5D).

### 1.10 The A–F taxonomy mapped onto our vocabularies (no third vocabulary)

The master's A–F is an **answer-determinacy** axis. Our L0–L7 legends (RECONCILIATION T2) are a
**rule-shape** axis — NL rides L1 (footprint + height) regardless of A–F status — so A–F must
NOT be forced onto L0–L7. The existing determinacy vocabulary it extends is
`EnvelopeStatus`/`EnvelopeConfidence` + the closed refusal-code set (C58 §1.13):

| Master | PRYZM seat today | State |
|---|---|---|
| **A** fully determined + signature | `structured` under a signed L-449 gate (SIG-NL1; `l449CertificationGates.ts` dereferences the signature) | **SHIPPED** — the signature-before-A rule is bitwise ours |
| **B** with conditions | `structured`/`estimated-ruleset` + mandatory carried caveats (RASE; §NL-OVERLAY-CARRY, §NL-GOOTHOOGTE-CARRY) | **SHIPPED** as prose caveats; not a typed status member |
| **C** bounded underdetermined | `estimated-ruleset` upper bound (§NL-SPARSE-FALLBACK zone extent) + `ContextDerivedStudyEnvelope` | **SHIPPED** in behavior; the roof case (§7.4) should join it |
| **D** requires legal interpretation | refusal codes `derived-plan`, `regime-undetermined` (ADR-0274) | **SHIPPED** |
| **E** source missing | `source-data-unavailable` (transient) + `no-rule-pack` (gate-shut) — finer than E: we split network from governance | **SHIPPED, finer** |
| **F1** plan-no-mechanism (a gap) | `no-plan-at-point` — **conflated with F2** | **GAP** — one code covers both |
| **F2** correct null (water/infra) | (same code) | **GAP** — extend the closed refusal enum (or add a `nullBasis` field); do not mint a new vocabulary |

The F1/F2 split is our own §CONTEXT-DATA-HONESTY doctrine ("failure and empty are different
facts") applied one level further — to two KINDS of empty. That it corrupts coverage statistics
(master §9) is exactly why it matters for M1/M3.

---

## 2 · THE MISSING PIECES, ranked

Tags: **US** = PRYZM builds it · **DATA** = source/ingestion work · **FOUNDER** = a decision or
signature. Effort in the region-doc scale (days/weeks/months).

| # | Piece | Master § | Tag | Effort | Notes |
|---|---|---|---|---|---|
| 1 | **File the free DSO API key** | §3 | **DATA + FOUNDER** (a form, not procurement) | **hours** | The single unblock for #2, M4, M6, and the RP-v4 text endpoints. Already the region doc's "ONE unblock". |
| 2 | **DSO Presenteren v8 modern leg** (Omgevingsplan adapter; second CLSM adapter per master §10) | §3/§10, M6 | US | **weeks** | Typed NormSpec/Normwaarde objects, `_zoek` point queries in EPSG:28992. Registry row + probes already done (2026-08-31). Consume BOTH APIs, merge by temporal validity (the sourceRegistry note says exactly this). |
| 3 | **Overlay-stack consumption** — query `dubbelbestemming` + `gebiedsaanduiding` (+ functie-/bouwaanduiding, figuur); SUBTRACT/condition via `polygonDifference`; ordered overlay model (B4/E3 fix) | §5C | US + DATA | **days–weeks** | The primitive (oracle-pinned difference, holes first-class) is shipped; this is proxy layers + an ordered stack + caveat→geometry promotion. Highest honesty ROI: converts today's carried caveat into the envelope. |
| 4 | **`as_of_date` temporal selection** on the NL leg | §5B | US | **days** | Seats exist (`Scenario.asOfDate`, `isInForceOn`). WMS serves current-published only → full history needs #1/#2; an interim honest step is stamping "as-of = publication now" on provenance. |
| 5 | **Peil / begripsbepaling extraction + `HeightDatum` stamping on NL** | §7.1 | US + DATA | **weeks** | ADR-0377 is the model (`unknown` = `datum-unresolved`); wire the NL leg to STAMP a datum (today: `unknown`, with a Z-bottom caveat — days), then extract per-plan begripsbepalingen from regels text (needs #1) and bring AHN/BGT in as evidence (BGT adapter documented, AHN new). |
| 6 | **Roof determinacy** — read `dakhelling`/`nokhoogte`/`nokrichting`; typed `roof_geometry_status = UNDERDETERMINED` + bounds; feed `inclinedTop` where determinate | §7.4, M5 | US | **days** | Classifier extension + a status member; the drawing/volume machinery exists. Closes matrix D5 fully (caveat → typed bounds). |
| 7 | **F1/F2 refusal split** (`no-plan-at-point` → plan-no-mechanism vs correct-null) | §9 | US | **days** | Extend the closed refusal enum; water/infra detection can ride the bestemming naam (`Water`, `Verkeer`) — data already returned. Prerequisite for honest M1/M3 statistics. |
| 8 | **Bebouwingspercentage denominator scope** | §7.2 | US | **days** | Extend the `valueBasis` precedent (DK fix) to coverage: numerator/denominator/scope_geometry. |
| 9 | **`inhoud` volumetric constraint** | §7.5, M2 | US | **days** | Add classifier kind + V ≤ V_max via `solveInclinedTop`'s exact volume; mostly rural (`Wonen` buitengebied) plans. |
| 10 | **Vergunningvrij layer + monument/stadsgezicht carve-outs FIRST** | §8 | US + DATA + FOUNDER | **weeks** | Entirely new: achtererfgebied/bebouwingsgebied geometry (Bor Bijlage II), RCE monument + beschermd-gezicht sources, and a founder signature — it publishes rights PRYZM computes, the exact class SIG-NL1 excluded (cf. the still-shut `NL_STOREY_DERIVED_HEIGHT_CERTIFIED`). |
| 11 | **Voorrangsregeling as a distinct operation** | §5D | US + DATA | **weeks** | Needs plan-text precedence clauses (#1) + the E3 rank seat consumed. Distinct from the dossier pick, which stays. |
| 12 | **Four-tier legal model** (Bkl, provincial verordening) | §4 | DATA + US | **weeks–months** | New instrument tiers in provenance; provincial verordeningen are DSO documents (#2 helps). |
| 13 | **Rule-parsing grammar for NL regels text** | §12 | US + DATA | **months** | Only needed once #5/#11 read prose; port the SPACM grammar pattern, never a runtime LLM (master §1 = C58 §1.1, already agreed). |

Deliberately NOT on the list: the storey-derived-height sub-path (`NL_STOREY_DERIVED_HEIGHT_CERTIFIED
= false`) stays shut by the founder's own recorded exclusion — the master prompt's
"never invent a constraint" endorses keeping it shut.

---

## 3 · PHASE 0 — which of M1–M6 PRYZM can measure TODAY

Specs are executable-later designs; **nothing was run in this audit.**

| M | Measurable today? | With what |
|---|---|---|
| **M1** bouwvlak coverage % | **YES (centroid-sampled)** | Shipped: BRK parcel provider (`pdok-nl`) + `fetchNlBestemmingsplan`. Spec: stratified sample of parcels (per-municipality urban/rural strata from BRK), one proxy call per centroid, tally `ringSource: 'bouwvlak'` vs `'bestemmingsvlak'` vs refusal reason, cross-tab by `bestemming` naam. Caveat to print on the result: point-in-polygon at the centroid, not a full overlay — an estimate of parcel-count coverage, not area coverage. |
| **M2** maatvoering fill % | **YES for 4 of 5** (`bouwhoogte`, `goothoogte`, `bouwlagen`, `bebouwingspercentage`); `inhoud` needs a one-line classifier extension (#9) — or run the tally on RAW `naam` strings server-side, which needs no code change and also yields the full SVBP typering frequency table | Same sampling harness as M1; count non-null per `NlMaatvoering` field + raw-naam histogram. |
| **M3** 500 parcels through the §9 taxonomy | **YES, in OUR vocabulary** | Run 500 random BRK parcels through the live dispatch classification (`structured` / `estimated-ruleset` / each refusal code) and REPORT via the §1.10 mapping table. The two cells we cannot fill — F1 vs F2, and D-detection inside resolved plans — are themselves Phase-0 findings, printed as "conflated pending #7". Do not pre-build the splits to run the measurement: partial over blank (master §1). |
| **M4** peil resolvability in 50 plans | **NO — new ingestion** | Requires plan `regels`/begripsbepaling TEXT, which the WMS does not serve. Route: DSO key (#1) → RP-API v4 text endpoints (legacy plans) + Presenteren v8 (Omgevingsplan). Spec: for 50 sampled plan ids, fetch the begripsbepalingen article, extract the `peil` definition verbatim, cluster distinct definitions, report frequencies — a HUMAN reads the clusters (extraction-once, signed). |
| **M5** roof determinacy | **MOSTLY YES** | Co-occurrence of goothoogte+bouwhoogte: shipped fields, same harness as M2. Dakhelling/nokrichting/kap presence: the raw-naam histogram (M2 spec) counts the maatvoering-borne ones with zero code change; kap/plat-dak rules living in `bouwaanduiding` or regels text are invisible until #3/#1 — state that bound on the printed number. |
| **M6** Omgevingsplan vs Wro/IMRO split | **NO — needs the DSO leg** | The WMS mirror shows only the IMRO side; "how much territory has moved to IMOW-annotated rules" requires querying Presenteren v8 for the same sample and comparing (the sourceRegistry already records the expected answer's shape: IMOW is a growing minority in 2026, most parcels ride the transitional layer — M6 turns that note into a number). Spec: for the M1 sample, query both APIs, classify each parcel {IMOW-annotated / IMRO-only / both / neither}. |

**Phase-0 order of operations:** run M1/M2/M3/M5-partial on shipped machinery now (one
sampling harness serves all four); file the DSO key in parallel; M4/M6 the week the key lands.
Then STOP and report, per master §2 — the M-numbers decide how much of §2's ranked list is
worth building (e.g. if M2 shows inhoud fill ≈ 0 outside buitengebied, #9 drops in rank).

---

## 4 · WHERE THE MASTER PROMPT VALIDATES OUR ARCHITECTURE

Named convergences — two independently-derived designs agreeing:

1. **The human signature gate (master §1/§9-A) = L-449 + ADR-0283.** "Status A unreachable
   without a signature; confidence is not a substitute" is the exact content of
   `l449CertificationGates.ts` (the registry whose TEST dereferences the signature document) and
   ADR-0283's evidence-bounded publication. SIG-NL1 with its recorded EXCLUSION of the
   storey-derivation path is the master's "state between extracted and publishable", live.
2. **The five-answer distinction (master §9) = §CONTEXT-DATA-HONESTY.** "DATA MISSING ≠ NO
   UNIQUE GEOMETRY ≠ DISCRETIONARY ≠ NOT PERMITTED ≠ NOT APPLICABLE" is our closed refusal
   vocabulary + `legallyGrounded` axis, shipped NL-side as the seam-4 split (transient vs
   gate-shut vs genuine absence). The master pushes it one notch further (F1≠F2) — an
   extension of our own doctrine, not a correction.
3. **§7.6 inclined planes = ADR-0378 + `inclinedTop.ts`, already landed** — the "build the
   primitive once" instruction was executed before the prompt arrived (line-anchored today;
   molenbiotoop's radial surface is a small point-anchored variant of the same height field).
4. **§7.1 peil = ADR-0377 `HeightDatum`.** A first-class datum union with `unknown` as an
   honest member and refuse-on-unknown consumers IS `legally-bounded-datum-unresolved`. The
   model is shipped; the NL stamping is the gap (§1.6).
5. **§1 determinism / extraction-once / no runtime LLM = C58 §1.1/§1.9** (byte-deterministic
   parses, injected fetch, packs parsed once) — and §12's grammar design is the shipped Madrid
   SPACM grammar pattern.
6. **§6's never-naked-numbers record = `provenance.ts`** — `source{document,article,paragraph,
   version}`, `valid_from/valid_to`, derivation method, six-tier confidence with
   value=null ⇔ tier-6 coherence. Deltas: no `prompt_hash`/`extractor_version` literal on our
   RuleProvenance (the master's evidence table carries them), and confidence: ours is
   six-tier where the master has four — ours is the finer partition (audit F7: "the reference
   must not regress it").
7. **§1 partial-over-blank = §NL-SPARSE-FALLBACK** — the zone-extent upper bound instead of a
   refusal is precisely this principle, with the confidence forced down and the bound named.
8. **§10 cache-nationally = the whole-country bake/publish pattern** (context tiles, LU's
   national GeoPackage) — and §10's "engine never on raw API formats" is the
   provider→pack→dispatcher layering the NL leg already has.
9. **§15's "no value without an article" = the never-overstate gate family** —
   `check-envelope-never-overstates.ts` drives the REAL NL pack with a planted-overstate
   control and the courtyard-hole arm (§2b); our CI arm checks the harder geometric half
   (never overstate), the master adds the citation-presence half (cheap to arm: every
   `structuredFields` entry must carry `ordinanceRef` — largely true already via
   `DerivationEntry`).

**Where each side is ahead:** the master prompt is ahead on breadth (four legal tiers,
vergunningvrij, voorrangsregeling, temporal law); PRYZM is ahead on enforcement depth (an
executable never-overstate gate with a planted control, oracle-pinned polygon difference with a
stated error direction, the courtyard exactness 9,099.86 + 0.14 = 9,100.00, six-tier
confidence, and a LIVE signed nationwide route the master prompt still describes as a plan).

---

*Audit inputs (all absolute under the repo root): `packages/site-parcel-data/src/providers/resolveNlBestemmingsplan.ts` ·
`packages/site-parcel-data/src/rulepacks/nlBestemmingsplan.ts` · `packages/site-parcel-data/src/sourceRegistry/nl.ts` ·
`packages/site-parcel-data/src/l449CertificationGates.ts` · `packages/site-parcel-data/src/geometry/{inclinedTop,polygonDifference}.ts` ·
`packages/schemas/src/site/HeightDatum.ts` (ADR-0377) · ADR-0378/0379 · `apps/editor/src/ui/site/siteDispatch.ts` (NL branch ~:3284–3570) ·
`server/jurisdiction/nlBestemmingsplanProxy.js` · `tools/ga-gate/check-envelope-never-overstates.ts` ·
`audit/envelope-architecture/2026-09-02/{VALIDATION-MATRIX,RECONCILIATION,matrix-west}.md` ·
`docs/01-strategy/envelope-gap-master/region-central-eu.md` (NETHERLANDS block).*
