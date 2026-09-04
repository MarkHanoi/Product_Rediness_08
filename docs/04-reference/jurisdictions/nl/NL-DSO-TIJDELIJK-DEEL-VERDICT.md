# NL — is the *tijdelijk deel* served through Ozon/Presenteren? ⭐ **SPLIT — and it costs ONE discovery call**

> **PROVENANCE.** Lane ENVELOPE-NLDK **round 4**, 2026-09-04. This closes the FIRST of the two items
> the founder marked **`not-verified`** in [`NL-FOUNDER-BLOCKER-REVIEW.md`](NL-FOUNDER-BLOCKER-REVIEW.md) §11:
>
> > *"Is the tijdelijk deel served through Ozon/Presenteren, or only through ruimtelijkeplannen.nl?
> > **If the DSO serves the consolidated regeling including the tijdelijk deel, moves 1 and 2 COLLAPSE
> > into one integration and the whole plan gets cheaper.** Could not be confirmed from the sources
> > read — `not-verified`."*
>
> ⚠ **The answer was ALREADY REACHED in round 3 — in CODE, not in the documentation.**
> `packages/site-parcel-data/src/rulepacks/nlRegelingIdentity.ts` carries it as the frozen constant
> `NL_TIJDELIJK_DEEL_SERVING`, verdict `split-bruidsschat-in-ozon-imro-on-ruimtelijkeplannen`. Every
> doc a human reads — [`NL-ENVELOPE-COMPLETION.md`](NL-ENVELOPE-COMPLETION.md) §3 blocker 8,
> `FOUNDER-BLOCKERS.md` — still said **UNRESOLVED**. ⭐ *That gap is the finding underneath the
> finding: an answer that lives only in a source constant has not been delivered.* This document
> lands it where it is read, **re-verified independently**, and corrects one thing round 3 left
> exposed (§3).
>
> **Artefacts:** `findings/nl-phase0/nl-tijdelijkdeel-probe.mjs` → `.json` / `.log.txt` (round 4) and
> `findings/nl-phase0/nl-dso-surface-probe.json` (round 3). **No API key held in either run**
> (`dsoApiKeyPresent: false`). Every quote below is copied out of an OpenAPI document the DSO serves
> anonymously — **quoted from the source, never written by the person who wanted the verdict.**

---

## §0 — The verdict

**The tijdelijk deel has TWO HALVES and they are served by TWO DIFFERENT APIs.**

| Half of the tijdelijk deel | Served by | Content API | Keyless? |
|---|---|---|---|
| **The bruidsschat** (a *tijdelijk regelingdeel* under STOP/IMOW) | **Ozon** | **Presenteren v8** — `_links.tijdelijkDelen` off the hoofdregeling | ⛔ `x-api-key` |
| **The old bestemmingsplannen** (IMRO / Wro instruments) | **ruimtelijkeplannen.nl** | **Ruimtelijke Plannen API v4** | ⛔ `X-Api-Key` |

⭐ **So the founder's conditional does NOT hold in its strict form** — the DSO does not serve the
whole consolidated regeling from one endpoint. **But the plan gets cheaper anyway, for three reasons
the founder's framing did not have:**

1. ⭐ **ONE CREDENTIAL.** Both are `x-api-key` APIs of the **same ontwikkelaarsportaal**. Move 1's key
   request buys both halves. There is no second registration, no second contract, no second party.
2. ⭐ **ONE DISCOVERY CALL.** `POST /documenten/_zoek` on **Omgevingsinformatie Ontsluiten v2** takes a
   **GeoJSON geometry** and a **date** and returns **OW documents and IMRO documents in one list**
   (§2). Only *retrieval* is split; *"what governs this point"* is a single request.
3. ⭐ **THE JOIN IS PUBLISHED, NOT INFERRED.** `OmgevingsdocumentMetadata.gerelateerdeTijdelijkeRegelingdelen`
   — *"Tijdelijke regelingdelen die van toepassing zijn op dit omgevingsdocument"* — is a field. We do
   not have to reconstruct which tijdelijk deel attaches to which omgevingsplan.

⛔ **What does NOT get cheaper is precedence itself.** See §3: the API models the *parts* and their
*time axes*; **`voorrang` is not a relation it exposes**. Move 2 shrinks from *"a second integration"*
to *"a classifier over one free-text field"* — but it does not vanish.

---

## §1 — The Ozon half, verbatim

Every DSO **data plane** answers **401** without a key (`/regelingen` 401 · `/locaties/_zoek` 401 ·
RP.nl `/plannen` 401 — all re-measured this run), while every DSO **OpenAPI description** is served
**anonymously, 200**. Presenteren v8: **273,122 bytes, 214 schema components, version 8.5.2**. A spec
is a second, independent system describing the first — which is what a probe needs.

### §1.1 — `RegelingLinks` — the tijdelijk regelingdeel is a first-class linked resource

```json
{"title":"RegelingLinks","required":["annotaties","documentstructuur","self"],"type":"object",
 "properties":{
   "self":{"$ref":"#/components/schemas/HalLink"},
   "documentstructuur":{"$ref":"#/components/schemas/HalLink"},
   "annotaties":{"$ref":"#/components/schemas/HalLink"},
   "tijdelijkDeelVan":{"$ref":"#/components/schemas/HalLink"},
   "beoogdeOpvolgers":{"minItems":0,"type":"array","items":{"$ref":"#/components/schemas/HalLink"}},
   "tijdelijkDelen":{"minItems":0,"type":"array","items":{"$ref":"#/components/schemas/HalLink"}},
   "ontwerpTijdelijkDelen":{"minItems":0,"type":"array","items":{"$ref":"#/components/schemas/HalLink"}}}}
```

A regeling **HAS** `tijdelijkDelen` (many) and **IS** the `tijdelijkDeelVan` (one) — navigable in
**both** directions, with drafts carried separately as `ontwerpTijdelijkDelen`. Each link resolves to
a full `Regeling` with its own `documentstructuur` (rule text) and `annotaties` (the OW-objects:
`locaties`, `activiteiten`, `gebiedsaanwijzingen`, `regelteksten`).

⚠ **This proves the MODEL, not the CORPUS.** And it says nothing about the IMRO half: in the whole
Presenteren v8 spec, **`bestemmingsplan` occurs 0 times** and `IMRO` occurs **twice**, both on an
**omgevingsvergunning** (§3).

### §1.2 — `Regeling.conditie` — the relation is a named field, and it is a STRING

```json
"conditie":{"title":"conditie","type":"string",
            "description":"De verhouding is tussen dit tijdelijk deel en de hoofdregeling."}
```

⭐ **This is the precedence hook, and it is FREE TEXT.** The DSO states *that* there is a relation and
describes it; it does not hand you a code from a value list. Consuming it is a **classification
problem over a string** — the same shape as `peil` — so it must be modelled as `UNCLASSIFIED` until a
corpus is read, never as "subordinate by default".

Two neighbouring facts that **are** machine-readable:

```json
"opvolgerVan":{"title":"beoogdeOpvolgerVan","minItems":0,"type":"array",
  "description":"De Regeling die een andere Regeling vervangt (en daarmee de opvolger van de oude Regeling is).",
  "items":{"$ref":"#/components/schemas/Regeling"}}
"isVervangRegeling":{"title":"isVervangRegeling","type":"boolean"}
```

### §1.3 — `/regelingen/{uriIdentificatie}/voorkomens` — the time overlap is computed by the DSO

> *"Deze resource geeft voorkomens die niet meer geldig zijn, voorkomens die nu geldig zijn, en
> voorkomens die geldig worden in de toekomst. De voorkomens hebben hal-links naar bijbehorende
> objecten met hun eigen levensloop, zoals **tijdelijke regelingdelen** en ontwerpregelingen: — **een
> hal-link naar een tijdelijk regelingdeel wordt opgenomen bij ieder voorkomen dat overlapt in tijd
> met het tijdelijk regelingdeel**; — een hal-link naar een ontwerpregeling wordt opgenomen bij ieder
> voorkomen waarop de ontwerpregeling gebaseerd werd."*

**That is "which rules governed this parcel on date D", answered upstream.**

### §1.4 — Three independent time axes, on every object and every endpoint

```json
"Registratiegegevens": {"required":["beginGeldigheid","beginInwerking","tijdstipRegistratie"], … }
```

and as query parameters everywhere: **`geldigOp`** (legally valid on), **`inWerkingOp`** (in force
on), **`beschikbaarOp`** (as known to Ozon on — 103 mentions).
⭐ **`beschikbaarOp` is a REPRODUCIBILITY primitive:** it re-runs a past answer against the corpus as
it then stood, which is what makes a stored envelope answer **auditable** rather than merely
re-derivable. Nothing else in this dossier gives us that.

### §1.5 — Spatial search is on the regeling itself, in RD

```json
{"title":"RegelingZoekobject","properties":{
  "typeBevoegdGezag":{},"bevoegdGezag":{},"geometrie":{"$ref":"#/components/schemas/Geometry"}},
 "example":{"typeBevoegdGezag":["gemeente","provincie"],"bevoegdGezag":["gm0000","pv0000"],
            "geometrie":{"type":"Point","coordinates":[139784,442870]}}}
```

`POST /regelingen/_zoek` takes a geometry (**EPSG:28992 — read the example coordinates**) at a chosen
date; `regeltekstannotaties/_zoek` / `divisieannotaties/_zoek` then take a `GeoZoekRequestBody`
**inside** one regeling.

---

## §2 — ⭐ The bridge: Ontsluiten v2 returns BOTH halves in ONE list

The API's own description:

> *"De Omgevingsinformatie ontsluiten API ontsluit omgevingsinformatie uit meerdere bronnen in
> samenhang. Bijvoorbeeld om te kunnen zoeken naar **zowel omgevingsdocumenten in het kader van de
> Omgevingswet (OW), als IMRO-documenten (bestemmingsplannen en dergelijke) in het kader van de Wet
> op de Ruimtelijke Ordening (Wro)**."*

`POST /documenten/_zoek` — request body and parameters, verbatim:

```json
{"type":"object","properties":{
  "_find":{"type":"string","description":"Filtert documenten op titel, identificatie, uriIdentificatie en expressionId.","example":"NL.IMRO"},
  "bestuurslaag":{"$ref":"#/components/schemas/Bestuurslaag"},
  "regelgevingOfOverig":{"enum":["REGELGEVING","OVERIG"]},
  "geometrie":{"$ref":"#/components/schemas/GeoJsonGeometry"},
  "identificaties":{"type":"array","description":"Zoek op identificaties of uriIdentificaties. Te gebruiken zelfstandig of in combinatie met geometrie filter."}}}
```
parameters: `GeldigOp`, `InclusiefToekomstigGeldig`, `BeschikbaarOp`, `SynchroniseerMetTileset`, `Page`, `Size`, `Sort`, `Content-Crs`.

And the record it returns — **one type covering both worlds**:

```json
"Document": {"required":["_links","aangeleverdDoorEen","beschikbaarVanaf","geometrieIdentificaties",
   "heeftVectorTiles","identificatie","titel","type","uriIdentificatie","versie"],
 "properties":{ …,
   "omgevingsdocumentMetadata":{"$ref":"#/components/schemas/OmgevingsdocumentMetadata"},
   "imroDocumentMetadata":{"$ref":"#/components/schemas/ImroDocumentMetadata"}, … },
 "description":"Document metadata van een omgevingsdocument of IMR0-document."}
```

**Which metadata block is populated tells you which content API to call.** That is the routing rule,
and it is published, not guessed.

### §2.1 — The join, published

```json
"gerelateerdeTijdelijkeRegelingdelen":{"uniqueItems":true,"type":"array",
  "description":"Tijdelijke regelingdelen die van toepassing zijn op dit omgevingsdocument.",
  "items":{"$ref":"#/components/schemas/DocumentVersie"}},
"gerelateerdeTijdelijkeOntwerpRegelingdelen":{ …,
  "description":"Tijdelijke ontwerp regelingdelen die van toepassing zijn op dit omgevingsdocument."}
```

and the resolution rule for `GET /documenten/{uriIdentificatie}`, verbatim:

> *"Indien een `uriIdentificatie` van een tijdelijk deel wordt gebruikt: — **als het een tijdelijk
> deel is met api_object = 'Regeling', dan bepaalt de `beschikbaarVanaf`-waarde van dat tijdelijke
> deel welke versie van de hoofdregeling wordt teruggeleverd.** In dit geval is het tijdelijke deel te
> vinden in de `gerelateerdeTijdelijkeRegelingdelen`. — als het een tijdelijk deel is met api_object
> van 'OntwerpRegeling' of 'Besluitversie', dan wordt het tijdelijke deel als hoofddocument
> geretourneerd."*

⚠ **Read that carefully: asking for a tijdelijk deel can return the HOOFDREGELING.** A consumer that
assumes "the URI I asked for is the document I got" will silently mis-attribute rules. The version it
returns is pinned by the tijdelijk deel's `beschikbaarVanaf` — a third selector on top of
`geldigOp` / `beschikbaarOp`.

### §2.2 — ⭐ `isTamPlan` is a published boolean — the founder's TAM-IMRO deadline is machine-readable

```json
"ImroDocumentMetadata":{"required":["bekendmakingen","beroepEnBezwaar","heeftPlankaart","imroVersie",
  "isHistorisch","isTamPlan","onderdelen","ondergronden","planstatusInfo","regelStatus"], … }
```

All ten are **required**. The founder's §2 warning — *"TAM-IMRO ended 1 January 2026, after which new
procedures must use the hoofdspoor; our 'zero IMOW observed' measured a corpus that had a legal escape
hatch which has now closed"* — is therefore **measurable per document**, not an era we have to infer
from dates. `regelStatus`, `planstatusInfo`, `eindeRechtsgeldigheid` and `verwijderdOp` sit beside it,
so *"is this plan still operative"* is answerable from metadata alone.

---

## §3 — ⛔ The correction: **`voorrang` in the Presenteren spec is NOT voorrangsregels**

Round 3's surface probe recorded **`voorrang: 33`** in the Presenteren v8 spec, as a bare count in
`nl-dso-surface-probe.json`. Round 4 extracted the surrounding sentences. **All 33 are one boilerplate
paragraph, repeated once per endpoint:**

> *"Combineren van deze parameter met een expliciete tijdreis langs de beschikbaarOp tijdsas is niet
> mogelijk. Wanneer beide parameters meegegeven worden, dan krijgt de expliciete `beschikbaarOp`-
> parameter **voorrang** boven deze parameter."*

— **one query parameter takes precedence over another.** It has nothing to do with *voorrangsregels*.
There is **no** `voorrang` schema, **no** `voorrang` property, **no** value list, in any of the three
specs read.

⭐ **The lesson is this lane's own rule turned on itself: a keyword COUNT is not evidence, because a
count carries no location.** Left in a JSON artefact next to a question about precedence, `voorrang:
33` is a trap — read once as *"the API models precedence"*, the correctness risk the founder ranks
**#1** is booked as SOLVED by an API that does not solve it. Round 3's prose did not make that claim;
its artefact still invited it. **Now it cannot.**

The same extraction relocated **`iMROPlanidentificatie`** — it is **not** on a regeling at all:

```json
"iMROPlanidentificatie":{"title":"IMRO-planidentificatie","minItems":0,"type":"array",
  "description":"het IMRO-plan-ID waar deze vergunning bij hoort/van afwijkt.","items":{"type":"string"}}
```

It is on an **omgevingsvergunning**. The RP.nl plan id survives as the **permit's** anchor, not the
tijdelijk deel's — which is exactly why the IMRO half must be fetched from RP API v4 and joined on
**location**, not on an id carried by Ozon.

---

## §4 — What this changes for the founder's 8 moves

| Move | Before | After |
|---|---|---|
| **1 · request key, re-run seed `20260903`** | *"closes M6, our only open question"* | ⭐ **same cost, larger payoff** — one key reaches Presenteren v8, RP API v4, Ontsluiten v2 and the Catalogus |
| **2 · voorrangsregels, ~2 weeks** | a **second** integration | ⭐ **discovery collapses into move 1** (§2). Consolidation of wijzigingsbesluiten into the hoofdregeling is done upstream by LVBB/Ozon; `/voorkomens` gives the per-date overlap. **What remains is a CLASSIFIER over `conditie`, not an integration.** |
| **9.1 · regeling identity, not plan id** | proposed | ✅ **confirmed**: `uriIdentificatie` + `expressionId` + `Registratiegegevens.versie`, selected by `geldigOp`/`inWerkingOp`/`beschikbaarOp` — and `beschikbaarVanaf` when a tijdelijk deel is the key (§2.1) |
| **9.2 · ontwerpregelingen as a free forward view** | proposed | ✅ **confirmed**: `ontwerpTijdelijkDelen`, `gerelateerdeTijdelijkeOntwerpRegelingdelen`, `/ontwerpregelingen/_zoek` (spatial), `renvooi` + `_delta` |

---

## §5 — What is STILL NOT ESTABLISHED

A spec describes the **contract**, not the **contents**. This probe does **not** establish:

1. **That any gemeente's `tijdelijkDelen` / `gerelateerdeTijdelijkeRegelingdelen` array is populated.**
2. **That the rule text is retrievable in the depth the envelope needs** — `bouwhoogte`, `goothoogte`,
   `dakhelling` as annotated OW-objects rather than as prose divisies.
3. **What `conditie` strings actually say** across a corpus. The classifier of §1.2 has no training
   set until a key exists.
4. **Any volume.** Every data plane is 401, so [`NL-ENVELOPE-COMPLETION.md`](NL-ENVELOPE-COMPLETION.md)
   §1.6's counts stay **OPEN**.

⛔ **All four need one thing: `DSO_API_KEY`** — a **free registration a human must complete** at
`developer.omgevingswet.overheid.nl`. The spec's own words: *"De API-key die je hebt gekregen dient
bij elke request naar de API via de `x-api-key` request header meegestuurd te worden."*
**No key exists in this environment** (`dsoApiKeyPresent: false` in both probe artefacts).
**This lane did not fake one, and no number in this dossier is derived from a key.**

---

## §6 — The integration shape

```
① DISCOVERY  (one call, both worlds)
POST /publiek/omgevingsinformatie/api/ontsluiten/v2/documenten/_zoek
     { geometrie: <parcel, GeoJSON> }        ?geldigOp=<date>&beschikbaarOp=<date>
     → Document[]   type · uriIdentificatie · versie
                    omgevingsdocumentMetadata → gerelateerdeTijdelijkeRegelingdelen[]  (OW half)
                    imroDocumentMetadata      → isTamPlan · imroVersie · regelStatus    (IMRO half)

② OW CONTENT                                  ③ IMRO CONTENT
POST …/presenteren/v8/regelingen/_zoek         GET …/ruimtelijke-plannen/api/opvragen/v4
GET  …/regelingen/{id}/voorkomens                   /plannen/{planId}/bouwvlakken
POST …/regelingen/{id}/regeltekstannotaties/_zoek   /plannen/{planId}/maatvoeringen
     → regelteksten · locaties · activiteiten        /plannen/{planId}/artikelen/_zoek
       · gebiedsaanwijzingen · conditie
```

⭐ **One key. One discovery call. Two content APIs, joined on LOCATION and DATE.**
`packages/site-parcel-data/src/rulepacks/nlTijdelijkDeel.ts` encodes the routing, the
`conditie` classification and the honesty rule — a half we did not read is
**named**, and every parameter recovered while a half is unread carries
`NL_OVERRIDES_NOT_CHECKED_CAVEAT`.
