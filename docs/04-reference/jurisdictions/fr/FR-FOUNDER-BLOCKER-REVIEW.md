# FR — the founder's blocker review (transmission, 2026-09-04)

> **PROVENANCE.** Founder review of [`FR-ENVELOPE-COMPLETION.md`](FR-ENVELOPE-COMPLETION.md),
> received **2026-09-04**, same day as that document. Captured per the standing rule.
>
> **What it does.** It takes the nine blockers that doc listed and, one by one, says which are
> **solvable**, which are **misclassified**, which are **ceilings rather than defects**, and which are
> genuinely hard — then gives a **sequenced plan** in which the PDF leg is move **7 of 8**, not move 1.
>
> ⛔ **It also corrects one factual error in our own document.** See §3.
>
> ⚠ Legal and coverage figures below are the founder's, sourced but **not re-verified by PRYZM**.
> Verify before acting — the review itself marks LiDAR HD coverage `not-verified`.

---

## §0 — The reframing that governs everything else

> **"The achievable target isn't 100 % parameters. It's 100 % TYPED OUTCOMES"** — every parcel returns
> either a parameter set, a declared-method derivation, or a **cited refusal**, and **never a silent
> null**.

**Define done as:** every parcel returns a typed outcome. **The target is `unrecovered/silent = 0`,
not `recovered = 100 %`.**

And replace the single completion figure with a **matrix: regime × parameter × source tier**, every
cell independently measured, **honest zeros visible**.

### The genuinely unreachable three — and why they will not become data problems

| | Why it is not a dataset |
|---|---|
| **ABF outcome** | the trigger is a dataset; the future decision of a named official is not |
| **Mitoyenneté as a legal fact** | property law, held in titles and acts, not national GIS |
| **PAU as an AUTHORITATIVE determination** | ⭐ the State, answering a parliamentary question: appreciation of urbanised character depends closely on local circumstances — dense or diffuse habitat nearby, distance to nearest constructions, protection of agriculture or landscape, servicing by equipment, topography, and features marking the limits of urbanisation such as a road or river. **Hence there can be no definition, still less national criteria**; the notion is left to the local authority's appreciation under the judge's control |

> **That is a legislature deliberately declining to define a standard. No dataset closes it.**

---

## §1 — Blocker 1 · `pdf`, 389 — solvable, but four decisions determine the yield

> *"Four design decisions that determine whether the delta is 30 % or 5 %."*

1. ⭐ **Emit SRU niveau 1 as the OUTPUT format.** Level 1 was validated by the CNIG standards
   commission in **November 2022** and is applicable; it is the **obligatory input to level 2**, which
   is the level carrying parameters. The SG6 roadmap explicitly names an ecosystem-built translation
   tool as the missing piece. **Your 389 parsed PDFs become forward-compatible assets instead of a
   proprietary stopgap.**
2. ⛔ **Key on the TRIPLE, not the pair.** `frCnigPrescriptionTree.ts` appears keyed on
   `TYPEPSC.STYPEPSC`. The standard's composite key is **`TYPEPSC-STYPEPSC-NATURE`** — its own worked
   examples are `TYPEPSC=15, STYPEPSC=01, NATURE=retrait_par_rapport_voies` and
   `TYPEPSC=07, STYPEPSC=02, NATURE=Cones_de_vue`. **SRU niveau 1 uses exactly that form as its
   `idPrescription`.** Upgrading now is cheap and makes the tree the SRU join key later.
3. ⭐ **Scope extraction BY ZONE before parsing.** SRU niveau 1 title records carry the zone `LIBELLE`
   (or the conventional `dispositionGenerale` when a title applies to all zones) and the
   `idPrescription` the title governs. **That structure cuts a 200-page règlement to the ~4 pages
   binding a given parcel BEFORE you attempt a number.** Extraction accuracy on 4 scoped pages is a
   different problem from extraction on 200.
4. **Co-extract the DATUM with the number, or do not count the number.** See §9.

⚠ **Do not promise "addresses 389 (73.5 %)".** Reaching a PDF is not recovering a value; an unknown
share lands in `semantic` after parsing. **Restate as: puts 389 within reach; post-parse yield
UNMEASURED.**

---

## §2 — Blocker 2 · SRU absent — already solved, but make the refusal DATED

*"0 of 81 won't survive the next enthusiastic reader."* Add the reasons so the question closes for two
years:

- **Level 1 structures TEXT ONLY** — titles, subtitles, paragraphs, alinéas — with the stated
  objective of easing reading and navigation. **It carries no parameters.**
- **Level 2, which does carry them, is in finalisation.**
- The level 1 standard states its own status: **not currently covered by any regulation in force.**
- The live corpus on the SOGEFI demonstrator is **two communes** — Pechbonnieu (31) and
  Preignan (32).

---

## §3 — Blocker 3 · `semantic`, 81 — split it, and ⛔ a correction to our own document

**Split into `semantic-resolvable` and `semantic-irreducible`, and measure each.** CNIG SG6 concedes a
written règlement will never be 100 % modellable at level 2 — ambiguous formulations, exceptions and
particular cases resist computer modelling; the goal is **progressive coverage of principal rules, not
exhaustiveness**. *"Otherwise someone budgets against an asymptote."*

### ⛔ The error, and it is ours

`FR-ENVELOPE-COMPLETION.md` §3 item 3 illustrated French compositional rule text with
**`"ter plaatse van…"`** — **that is DUTCH**, leaked in from the Netherlands lane.

> *"In a document whose stamp says every number names its source, a wrong-country example is what a
> reader finds and then re-reads everything else with suspicion."*

**Corrected in place 2026-09-04.** The real French shapes, which also tell the parser builder what to
target:

```
"sauf indication contraire portée au document graphique"
"la hauteur peut être portée à … lorsque …"
"au droit de …"
"sous réserve que …"
```

---

## §4 — Blocker 4 · `missing-source`, 59 — mostly a MISCLASSIFICATION, solvable this week

- **9,461 of France's 35,010 communes have no local urbanism document at all** and are consequently
  subject to the **RNU** — **23.77 % of national surface**.
- A further **2,973 carte-communale communes** have authorisations instructed on the RNU basis under
  **art. R.162-1**.

⭐ **In roughly 12,400 communes there is NO MUNICIPAL PDF TO PARSE.** The applicable rules are national
articles: one corpus, fixed text, already structured by the Code's own numbering — covering
localisation, implantation and servicing, density and reconstruction, heritage and landscape elements,
and environmental and energy performance.

**We already hold the lookup**: commune RNU status is served by API Carto. So this is *a rule pack plus
a lookup we already have.*

Two knock-ons that must be stated in the doc:

- Some of the 59 are **RNU communes correctly observed and wrongly concluded**. *"No PLU found"* is the
  observation; *"no source"* is the wrong inference.
- ⭐ **`discretionary = 0` stops being an artefact.** Under the RNU the *conseil municipal* may
  authorise constructions outside the urbanised parts **by reasoned deliberation**, notably to avoid a
  decline in communal population. **That is textbook E4. A correct France run has a substantial
  discretionary bucket.**

> *"This moves the honest-answer rate hard and the 3.0 % barely at all — which is itself the argument
> for promoting honest-answer to the headline."*

---

## §5 — Blocker 5 · prescription with no value — a CEILING, not a defect. Publish it.

⛔ **The CNIG prescription schema has no numeric value field.** `PRESCRIPTION_SURF/_LIN/_PCT` carry
`TYPEPSC`, `STYPEPSC`, `NATURE`, `LIBELLE`, `TXT`, `NOMFIC`, `URLFIC`, `IDURBA`, `DATVALID`. `URLFIC`
is defined as the link to the file containing the text describing the prescription — **hyperlink,
empty permitted**.

**Paris's `txt=""` is the schema behaving as specified.** 9/24 samples a **structural ceiling**, not
producer quality. Add to §1.2:

```
GPU-only ceiling — share of applying prescriptions with a
parseable numeric TXT                              n/500 = X %
```

> *"That reframes 3.0 % from 'we recover 3 %' to 'the national chain can yield at most X %, and we
> recover 3 of it.' It also kills the inevitable `TXT`-cleanup proposal."*

---

## §6 — Blocker 6 · RNU → PAU — reframe `undeterminable` → **`derivable-non-authoritative`**

*"Your §7 invented exactly the right axis for frontage. PAU belongs on it too, and the evidence is
stronger than you'd expect."*

**The criteria are judicially settled even though the definition is not:**

| Authority | Holding |
|---|---|
| **CE 29 mars 2017, *Commune de Saint-Bauzille-de-Putois*, n° 393730** · **CAA Douai 31 oct. 2018, n° 16DA01991** | PAU = parts of communal territory already comprising **a significant number and density of existing constructions** |
| **CAA Bordeaux, 20 déc. 2018, n° 16BX04244** | **construction density** and **the existence of access roads and equipment** are the principal criteria |
| | a project is inside where it is in **continuity or immediate proximity** and **does not extend urbanisation** |

⭐ **And it has been automated — by the State.** A **DREAL Auvergne-Rhône-Alpes / IADT** study
established a common PAU definition across State services and produced a **SIG model that
automatically traces a commune's PAU from modulable criteria** — distance to the nearest dwelling,
number of dwellings generating a PAU — as an aid to instructing urbanism acts in RNU communes. *Marked
for restricted distribution to State services.*

> **The honest position is not "undeterminable." It is: a parameterised derivation exists, the State
> uses one, and no derivation is authoritative.**

**Output:** the derived PAU geometry, **parameter set declared**, jurisprudence cited,
`confidence: assumed`, and an explicit statement that **only the instructing authority determines
this**. Inputs already held: BD TOPO buildings, LiDAR HD building points, road network, cadastre.

---

## §7 — Blocker 7 · ABF — structurally solved, not data-solved

Trigger is reachable (monument historique, SUP AC1, périmètre délimité des abords, site patrimonial
remarquable). Outcome is a future administrative act.

**Correct output is E4: a RANGE with a stated basis, plus the flag — never a single number.** This is a
resolved design question, not a blocker.

⚠ **But: §4 does not say whether the envelope model can CARRY a range.** That is the real open item.

---

## §8 — Blocker 8 · mitoyenneté — probably MIS-FRAMED

The rule in a French PLU is almost always *"implantation en limite séparative **autorisée / imposée /
interdite**"* — **a RULE PARAMETER, not a property fact**. Whether the neighbouring wall is legally
mitoyen matters only in the narrower case of building **on** an existing party wall.

**Split it:** the implantation rule is **`extractable`** through the same PDF channel as setbacks; the
legal party-wall status is `undeterminable` and affects a small subset.

> *"Right now one hard 🔴 is standing in for both, and it makes France look more blocked than it is."*

---

## §9 — Blocker 9 · the height datum — solvable in the parser, and it should TIGHTEN the 15

`interpretive` is correct and **not enough**: *a recovered "9 m" whose datum is unknown fails A2, and by
your own provenance doctrine is arguably not a recovery.*

Make it a **typed field** with the enum already named — `terrain naturel · terrain après travaux ·
niveau de la voie · égout · acrotère · faîtage` — **plus `unknown`**. In the règlement the datum phrase
sits within a sentence or two of the number, so it is a **co-extraction target**, not a separate
problem.

⛔ **Then decide explicitly, in the document: does a height with `datum=unknown` count in the 15/500?**

> *"If you tighten, the 15 may fall. Take that hit deliberately rather than have a customer find it."*

---

## §10 — Two upgrades §2 does not yet claim

### §10.1 — Terrain: move RGE ALTI → **LiDAR HD**

- Delivers **MNT, MNS and MNH** — the last being the height model **already computed as MNS − MNT**
- **50 cm**, 1 km GeoTIFF tiles, from a classified point cloud at **≥10 pulses/m²**
- **Altimetric precision ≤ 10 cm**, planimetric 30–50 cm; cloud classified with a dedicated
  **buildings** class
- **Licence Etalab 2.0 — explicitly usable for COMMERCIAL deliverables** with attribution to
  *"IGN – Programme LiDAR HD"*
- Coverage ~**80 % of metropolitan France at end-2025**, full metropolitan + DROM (excl. Guyane)
  planned **2026**; progress map `macarte.ign.fr/carte/mThSup/diffusionMNxLiDARHD`

⚠ **IGN describes the LiDAR HD MNT as prefiguring the next generation of its ground reference — so
RGE ALTI is being SUPERSEDED, and marking terrain `source-complete` on RGE ALTI is a version-lag
risk.** ⭐ **MNH gives A6 without computing it**, at 50 cm rather than BD TOPO's LoD1.

⛔ **`not-verified`: LiDAR HD coverage for our sample area was NOT checked. Probe the progress map
before acting — move 8 is gated on it.**

### §10.2 — Frontage: build it
*"The cheapest item on this list, it unblocks every `15.01` road-setback rule, and it's a prerequisite
for A4."*

---

## §11 — Three cuts that are free and probably load-bearing

> *"You hold all the keys already."*

- **Vintage.** `DOC_URBA` gives `DATAPPRO`. Documents under **v2022-10 / v2024-01 (2.1.0, the
  published version in force)** carry `NATURE`; **v2017c/d do not.** Recovery almost certainly differs
  by stratum, and the newer stratum grows.
- **Regime.** PLU / PLUi / POS-caduc / carte communale / RNU — free today via API Carto.
- ⭐ **Source tier.** National GPU chain vs municipal pack. §1.3 says pack recovery is higher *"by an
  unmeasured margin"* — **and §5 then picks the PDF leg without measuring it.**
  **Re-run seed `20260904` with `resolveParisPluZone.ts` ENABLED. One run, one number, and it tells you
  whether the PDF leg or a pack-adapter lane is the better investment.**

### The packs carry real named attributes — and one structural trap

| Pack | Carrier |
|---|---|
| **Lyon PLU-H** | façade height on the zone as **`HBCPRINC` / `HBCSEC`** by constructibility band, or **`PLAFOND`** where there is no band distinction, plus coefficient d'emprise au sol — ⚠ **but only OUTSIDE Lyon and Villeurbanne**, where heights move to separate **périmètres** layers and the **îlot zoné** becomes the carrier |
| **APUR** | `PLU HAUTEUR` and `PLU EMPRISE` across the Paris metropolitan communes |
| **Rennes Métropole** | height sectors expressed **in levels OR in metres**, overridable by plan de détail, plan masse, plan d'épannelage or OAPq — ⚠ **colours have no regulatory value; the LABEL determines the height** |

> ⭐ **The Lyon carrier-switch is the general lesson: the geometry carrying the number can change by
> SUB-TERRITORY inside one document. Model `parameter_carrier_layer` per sub-territory or every
> metropole adapter will silently null out its densest core.**

---

## §12 — The sequence

| # | Move | Moves | Cost |
|---|---|---|---|
| **1** | RNU/CC national rule pack + regime lookup | honest-answer ↑↑, `missing-source` ↓, discretionary becomes real | **days** |
| **2** | Publish the GPU-only `TXT` ceiling | stops phantom budgeting | **hours** |
| **3** | Re-run seed with Paris pack enabled | **decides move 6 vs 7** | **one run** |
| **4** | Frontage derivation | unblocks all `15.01` | **days** |
| **5** | PAU as `derivable-non-authoritative` + datum enum | two hard 🔴 become typed | **~1 week** |
| **6** | APUR, then Lyon (carrier switch), then the rest | parameter ↑↑, developer-weighted | **parallel** |
| **7** | PDF leg emitting SRU niveau 1, zone-scoped, triple-keyed | **the 389** | **months** |
| **8** | LiDAR HD swap-in for terrain + A6 | A2/A6 accuracy | **days, gated on coverage** |

⛔ **Verify before acting on move 8:** LiDAR HD tile-level coverage for the sample area against IGN's
progress map. **Marked `not-verified`.**
