# Paris (75056) — portal resource map, version trap, and the article-numbering correction

> **Status: VERIFIED-LIVE, 2026-07-31.** Every claim below came from a request this repo issued or a
> PDF this repo downloaded and opened. Reproduction commands in §6.
>
> ⚠ **Two findings invalidate parts of the existing Paris plan.** §2 (article numbering) and §3
> (version trap) must be read before any extraction work is scheduled.

---

## §1 — The binary endpoint, solved

The Ville de Paris règlement portal is a **Lutece CMS** instance. `Portal.jsp?document_id=198` is the
*document object*; the downloadable files sit behind a separate servlet:

```
https://regles-urbanisme.paris.fr/plu-bioclimatique/servlet/plugins/document/resource
    ?id=<N>&id_attribute=93&nocache=true&working_content=true
```

**Enumerated ids 150–250, headers only.** PDF/ZIP resources found:

| id | filename | bytes | Last-Modified |
|---:|---|---:|---|
| 189 | `REG2A10_1DE2.pdf` | 6,028,414 | Thu, 02 Jul 2026 |
| 190 | `REG2A10_2DE2.pdf` | 6,687,679 | Thu, 02 Jul 2026 |
| **191** | **`REG1.pdf`** — Règlement **Tome 1** (contains all UG articles) | 5,926,863 | Wed, 10 Jun 2026 |
| 192–197 | `RP_PREAMBULE` · `RP_INDIC` · `RP_EVAL` · `RP_RNT` · `RP_CHOIX` · `RP_EIE` | — | Dec 2024 |
| 206–225 | `OAP_*.pdf` — 20 Orientations d'Aménagement | — | Dec 2024 – Jan 2025 |
| **239** | **`Plan___Hauteurs_des_constructions.pdf`** | 5,243,914 | — |
| 240 | `Plan___Materiaux_de_toitures.pdf` | 5,067,723 | — |
| 241 | `Plan_de_zonage_et_de_protection_du_commerce_et_de_l_artisanat.pdf` | 4,351,533 | — |
| 242 | `Plan_du_secteur_d_application_de_la_servitude_logement_social.pdf` | 4,304,113 | — |
| **243** | **`Plan_des_fuseaux_de_protection.pdf`** | 5,244,336 | — |
| 245–248 | `Plan_du_secteur_{Nord,Centre,Est,Sud}.pdf` — the 1/2000 atlas | 13–15 MB each | — |

**Range not exhausted** — ids <150 and >250 were not scanned.

---

## §2 — ⚠ CORRECTION: **UG.6 – UG.10 DO NOT EXIST**

`REG1.pdf` downloaded and opened (250 pages, born-digital, median 2,589 chars/page, **zero** scanned
pages in a 30-page sample). Its actual UG heading structure:

```
UG.1  Occupations et utilisations des sols, destinations
UG.2  Caractéristiques architecturales et urbaines des constructions
UG.3  Implantation, hauteur et volumétrie des constructions
      UG.3.1  Implantation des constructions
      UG.3.2  Hauteur et volumétrie des constructions      ← HEIGHT LIVES HERE
      UG.3.3  Dépassements admis par rapport à la hauteur et à la volumétrie
UG.4  Espaces libres, végétalisation des abords des constructions
```

Regex search for `UG.9` and `UG.10` headings: **zero matches in 250 pages.**

**`UG.6 / UG.7 / UG.8 / UG.9 / UG.10` are the pre-2015 French PLU article scheme** (articles 1–16,
where 6 = implantation par rapport aux voies, 7 = limites séparatives, 8 = même propriété,
9 = emprise au sol, 10 = hauteur). That scheme was abolished by the post-ALUR règlement reform. The
PLU **bioclimatique** uses thematic numbering.

⇒ **Every Paris extraction task recorded in the corpus targets article numbers that no longer exist.**
The mapping to re-scope against:

| Corpus target (obsolete) | Actual location |
|---|---|
| UG.6 implantation / voies · UG.7 limites séparatives · UG.8 même propriété | **UG.3.1** Implantation |
| UG.10 hauteur | **UG.3.2** Hauteur et volumétrie (+ **UG.3.3** dépassements) |
| UG.9 emprise au sol | **not yet located** — search UG.3 / UG.4; do not assume it exists as a standalone article |

---

## §3 — ⚠ THE VERSION TRAP, third instance today

`id=191` returns `Last-Modified: Wed, 10 Jun 2026`. Its **title page** reads:

> **VERSION APPROUVÉE PAR DÉLIBERATION DU CONSEIL DE PARIS DES 16, 17, 18 ET 19 DÉCEMBRE 2025**

with `DÉCEMBRE 2025` in the running footer, and a cover line
`PROJET POUR APPROBATION … DÉLIBÉRATION 2024 DU 142 — OCTOBRE 2024`.

Per the portal's *Anciennes versions* page: **Version 59 = 9 Jan 2026 → 22 Jun 2026**, superseded by
**Modification simplifiée n°2, effective 23 Jun 2026**.

⇒ **`id=191` serves the SUPERSEDED Version 59.** The June 2026 `Last-Modified` is a re-upload
timestamp, **not** a version. Note ids 189/190 (Tome 2 annexes) carry **2 Jul 2026** — later than
Tome 1 — which is consistent with Modification simplifiée n°2 having touched the annexes.

**Three independent instances of the same trap, one day:**

| Jurisdiction | The lie |
|---|---|
| **Madrid** | Two official portals serve **different consolidations simultaneously** — geoportal = July 2025, transparencia = September 2025. No warning on either. |
| **Germany** | National GPU serves a **2024-11-20 snapshot** while the municipal portal holds current — ~20 months stale. |
| **Paris** | HTTP `Last-Modified` (Jun 2026) **contradicts the document's own title page** (Dec 2025). |

⇒ **The document authenticates itself; the transport layer does not.** Never accept a URL, filename,
or HTTP header as version evidence. Read the title page.

### Partial mitigation — a textual-delta check that came out clean

The current **HTML** règlement (read independently) and this **Dec 2025 PDF** agree on UG.3.2:
`application cumulative` (p68) and `se substitue` (p70) are present in both. So **Modification
simplifiée n°2 appears not to have altered UG.3.2** — meaning Version 59's height provisions are
likely still operative. **Likely, not proven**: only UG.3.2 was compared, not the whole tome.

---

## §4 — Height precedence: ANSWERED, and it is per-parameter

The règlement is **not silent**. UG.3.2 opens:

> *La hauteur et la volumétrie des constructions … sont définies par **l'application cumulative** des
> règles relatives : – à la limitation générale des hauteurs (UG.3.2.1) **ou, le cas échéant**, aux
> prescriptions de hauteur maximale des constructions (UG.3.2.2); – aux fuseaux de protection;
> – aux gabarits-enveloppes …*

And UG.3.2.2 carries **two explicit substitution rules**: HMC **substitutes for** the value of the
*Plan général des hauteurs*, and **within HMC perimeters the street- and side-boundary gabarit-envelope
provisions do not apply**.

| Layer | Legal role | Behaviour |
|---|---|---|
| `plub_hmc` | Hauteur maximale constructible | **substitutes for** Plan général des hauteurs; **disapplies** gabarit-envelope inside its perimeter |
| `plub_filet` | inputs to the gabarit-envelope rules | governs **outside** HMC perimeters; disapplied inside them |
| `plub_hauteur` | *probably* the GIS rendering of the Plan général des hauteurs | **see §5 — unconfirmed** |
| fuseaux de protection | independent constraint | **always cumulative**, never disapplied |

⇒ **Default is cumulative; precedence is targeted and per-parameter — not layer-over-layer.**

**This is the same structural answer as Madrid**, where no global precedence clause exists either and
the rule had to be assembled per-parameter from four independently-scoped clauses (and Art. 8.0.6's
catalogue override is narrow: *régimen de obras* and hospedaje only, **not** FAR/height/coverage).
Two jurisdictions, same shape. Direct input to the attribution layer.

### The GIS metadata does NOT encode this — a useful negative

`plub_filet` publishes `haut` (envelope code) + `cour` (crowning) + cadastral ids + geometry.
`plub_hmc` publishes `hmc` (`SOL`/`NGF`) + `ht_hmc` + geometry. **Neither carries precedence,
priority, validity, applicability, legal-status, or supersession fields**, and no evidence was found
that the GPU WFS adds any. Paris Open Data explicitly labels these
*"données disponibles pour information et sans valeur réglementaire"*.

⇒ **Denmark encoding bindingness in published metadata (`bygkunifelt`/`bygvejledende`) is the
EXCEPTION, not the norm.** The metadata-first acquisition sequence remains correct — it is cheap and
it produced a decisive negative here in one pass — but a negative must route to the ordinance, not to
an assumption.

---

## §5 — Open: is `plub_hauteur` the *Plan général des hauteurs*?

HMC's substitution rule is defined **against the Plan général des hauteurs**. If `plub_hauteur` is not
exactly that instrument, the substitution does not cleanly map to the layer, and any resolver wiring
it as such is wrong.

**Probed:** `id=239 Plan___Hauteurs_des_constructions.pdf` (5.2 MB). It is a **single-page map plate**
— 5,636 chars of scattered height codes (`M`, `B`, `T`, `C`, `1P`, `MC`), no prose, no title block, no
date. Searches for *plan général des hauteurs*, *hauteur maximale*, *décembre 2025*, *juin 2026*,
*modification simplifiée*: **zero matches**.

⇒ It is an **atlas plate**, i.e. graphical source material, not a titled legal instrument. Its code
vocabulary (`M B T C 1P MC`) **overlaps but does not match** the `plub_filet` codes recorded in the
corpus (`M K C B G`) — so the two are related but not identical, and neither is confirmed as the Plan
général des hauteurs. **State: ASSERTED-UNVERIFIED.**

**To close it:** fetch the `plub_hauteur` dataset's own documentation package on opendata.paris.fr
(`Hauteurs.pdf` / `metadata.xml`) and look for a `Source:` statement. If it names the *Plan général
des hauteurs*, the mapping is solved; if it says *compilation* or *derived*, that is a more
significant finding.

---

## §6 — Reproduction

```bash
UA="Mozilla/5.0 (compatible; PRYZM-research/1.0)"
B="https://regles-urbanisme.paris.fr/plu-bioclimatique/servlet/plugins/document/resource"

# enumerate (headers only, serialised, polite)
for id in $(seq 150 250); do
  curl -sS -A "$UA" -o /dev/null -D - "$B?id=$id&id_attribute=93&nocache=true&working_content=true" \
    | grep -iE 'content-(type|disposition|length)|last-modified'
done

# Tome 1
curl -sS -A "$UA" -o REG1.pdf "$B?id=191&id_attribute=93&nocache=true&working_content=true"
```

Then **open the PDF and read its title page.** Do not infer the version from the header.

---

## §7 — Evidence chain (G11)

| # | Claim | How obtained | State |
|---|---|---|---|
| P1 | Lutece resource endpoint + id→filename map (§1) | live header enumeration, ids 150–250 | **VERIFIED-LIVE** |
| P2 | `REG1.pdf` = 250pp, born-digital | downloaded, opened with PyMuPDF | **VERIFIED** |
| P3 | UG.6–UG.10 do not exist; real structure is UG.1–UG.4 (§2) | heading extraction over all 250 pages | **VERIFIED** |
| P4 | `id=191` is Version 59 (Dec 2025), superseded 23 Jun 2026 (§3) | PDF title page + portal *Anciennes versions* | **VERIFIED** |
| P5 | Cumulative application + two substitution rules (§4) | HTML règlement, corroborated by `application cumulative` p68 / `se substitue` p70 in the PDF | **VERIFIED** (two independent sources) |
| P6 | GIS schemas carry no precedence field (§4) | opendata.paris.fr dataset schemas | **VERIFIED** (negative) |
| P7 | `plub_hauteur` = Plan général des hauteurs | — not established — | **ASSERTED-UNVERIFIED** → §5 |
| P8 | Modification simplifiée n°2 did not change UG.3.2 | single-article HTML-vs-PDF delta only | **ASSERTED** (partial check) |
| P9 | The June 2026 Tome 1 binary | **not found** — ids <150 and >250 unscanned | **UNKNOWN** |

*Related: [`SOURCE-founder-paris-extraction-roadmap-2026-07-31.md`](./SOURCE-founder-paris-extraction-roadmap-2026-07-31.md) ·
[`../RATE-IMPLEMENTATION-PLAN.md`](../RATE-IMPLEMENTATION-PLAN.md) ·
[`../../findings/SOURCE-founder-france-machine-readable-legislation-schema-2026-07-31.md`](../../findings/SOURCE-founder-france-machine-readable-legislation-schema-2026-07-31.md)*


---

## §8 — CORRECTION to §1: `id=191` is ORPHANED, and the resource map is page-scoped

A second pass read the **complete** resource list on each portal page (the first pass truncated at 25
matches — my error, and it produced a wrong conclusion in §1).

**`document_id=198` (the Règlement page) links exactly:**
`128–176 · 186 · 188 · 189 · 190 · 749 · 750 · 751`

**`id=191` (REG1.pdf, Tome 1, Version 59) is NOT among them.** It is not linked from the Règlement
page, nor from `document_id=` 199/201/202/203/204/205/226/249/250/251, nor from the *Anciennes
versions* page (789, which links `790–815+`). It is reachable only by direct URL.

⇒ **`id=191` is an orphaned attachment.** It was found by search-engine indexing, not by navigation.
That is *why* it serves a superseded version: nothing on the live site points at it any more.

Link labels recovered from the page markup:

| id | label on page | file |
|---:|---|---|
| **137** | **"plan des hauteurs"** | `DG_E_HAUTEUR.pdf` (6,075,133 B) |
| 146 | zonage | `DG_A_ZONAGE.pdf` |
| 188 | Volume 1 du Tome 2 | — |
| 189 | Volume 2 du Tome 2 | `REG2A10_1DE2.pdf` |
| 190 | Volume 3 du Tome 2 | `REG2A10_2DE2.pdf` |
| 186 · 749–751 | Montmartre / maisons-villas / 1:2000 consultation guides | — |

**Other pages use entirely disjoint id ranges** — `doc 201 → 192–197, 385, 391, 787–788, 863` ·
`doc 202 → 444–461` · `doc 203 → 413–435` · `doc 204 → 437–443` · `doc 205 → 463–470`. So **id ranges
are page-scoped, not chronological**, and blind numeric enumeration is the wrong instrument: a range
sweep finds orphans and misses live links.

### ⇒ The Règlement page does not link Tome 1 at all

Graphics and Tome 2 only. The Tome 1 text link is therefore behind **client-side JS** or inside the
"Télécharger l'intégralité" bundle. **Static fetching cannot reach it.**

**Next step — Playwright** (available in this repo): open `Portal.jsp?document_id=198` and `page_id=4`,
click every download control, capture request URL → redirect chain → `Location` → `Content-Disposition`
→ bytes, then extract page 1 and stop at the PDF whose **title page** says *Modification simplifiée n°2*
or a **2026** Conseil de Paris deliberation. Filenames and `Last-Modified` remain inadmissible as
version evidence.

### ⇒ NEW LEAD for §5 (`plub_hauteur` provenance)

**`id=137` is labelled "plan des hauteurs" on the Règlement page itself** — a *page-asserted* label,
which is stronger evidence than `id=239`'s filename (`Plan___Hauteurs_des_constructions.pdf`, found by
range sweep and unlinked in the label scan). `DG_E_HAUTEUR.pdf`, 6.07 MB, `DG_` = *Documents
Graphiques*.

⇒ **Probe `id=137` before `id=239`** when testing whether `plub_hauteur` is the GIS rendering of the
*Plan général des hauteurs* that UG.3.2.2's substitution rule is defined against.

### Evidence-chain update

| # | Claim | State |
|---|---|---|
| P1 | id→filename map for the swept range | **VERIFIED-LIVE** (but §1's framing corrected here) |
| P10 | `document_id=198` links 128–176/186/188–190/749–751; **191 absent** | **VERIFIED-LIVE** |
| P11 | `id=191` unlinked from 11 portal pages checked | **VERIFIED-LIVE** (negative, not exhaustive) |
| P12 | `id=137` = "plan des hauteurs" per page markup | **VERIFIED-LIVE** |
| P9 | The June 2026 Tome 1 binary | **UNKNOWN** — behind JS; needs Playwright |

---

## §9 — CORRECTION to §8: Tome 1 **is** linked. The link is **malformed**, and it 404s.

Browser automation (`tools/paris-portal-probe/probe.mjs`, Playwright 1.59.1 driving system Chrome)
rendered `document_id=198` with scripts executed. §8 inferred the Tome 1 link was "behind client-side
JS". **That inference was wrong.** The link is present in plain server-rendered HTML, in the
`Pièces écrites` section, and it is simply broken:

```html
<h3 id="id-1" style="color: #354bcf;">Tome 1 du règlement</h3>
<p><span style="color: #000000;">Le <span style="color: #354bcf;">
  <a style="color: #354bcf;" href="id=755" aria-label="Lien de téléchargement pour 'Tome 1'">Tome 1</a>
</span> présente les modalités d’application, les dispositions générales et les règlements des zones…
```

`href="id=755"` is a **bare query fragment, not a URL**. Its sibling Tome 2 links in the very next
paragraph are well-formed absolute paths:

```html
<a href="/plu-bioclimatique/servlet/plugins/document/resource?id=188&id_attribute=93&working_content=true"
   aria-label="Lien de téléchargement pour 'Volume 1 du Tome 2'">Volume 1 du Tome 2</a>
```

A browser resolves `href="id=755"` **relative to the page**:

```
https://regles-urbanisme.paris.fr/plu-bioclimatique/jsp/site/id=755   →  HTTP 404   (observed)
```

⇒ **The Ville de Paris règlement portal has no working Tome 1 download link.** This is an editorial
error in the CMS — the id fragment was pasted instead of the resource URL — not a JS gate. It also
explains §8's orphan finding: `id=191` is unreferenced because the reference that *should* point at
Tome 1 points at `755` instead.

### §9.1 — What `755` is: a *third* outcome, distinct from both "file" and "absent"

`Failure ≠ absence` cuts finer than two ways here. Three response shapes were observed and separated:

| id | status | `Content-Disposition` | `Content-Length` | `Last-Modified` | classification |
|---:|---|---|---:|---|---|
| 188 | 200 | `attachment;filename="REG2A1.pdf"` | 4,225,963 | Thu, 02 Jul 2026 08:11:55 GMT | **HAS-FILE** |
| **755** | **200** | *(none)* | **0** | **Thu, 16 Jul 2026 15:13:30 GMT** | **EMPTY-BUT-EXISTS** |
| 999999 | 200 | *(none)* | 0 | *(none)* | **ABSENT** |

The presence of `Last-Modified` on `755` and its absence on `999999` is the discriminator: **record
755 exists and was touched on 16 Jul 2026, but its file attribute holds zero bytes.** A probe that
checked only `status == 200`, or only `Content-Length == 0`, would have collapsed these three distinct
states into one wrong answer.

Every route to `755` was tried; every one failed:

| route | result |
|---|---|
| `document/resource?id=755&id_attribute=` **1, 2, 3, 90–100** | 200, 0 bytes, identical `Last-Modified` at every attribute |
| `document/resource?id=755` with/without `nocache` / `working_content` | 200, 0 bytes |
| `Portal.jsp?document_id=755` (bare, `portlet_id=` 44/45/46, `page=document`) | 200 — but renders the **Home** page, i.e. not a valid `document_id` |
| `servlet/plugins/plubio/download?id=755` | 200, 0 bytes |
| `servlet/plugins/file/download?id=755` · `filegenerator/download?id=755` | 200, 0 bytes |
| `jsp/site/FileDownload.jsp?id=755` | **404** |

A neighbourhood sweep of resource ids **744–790** confirmed the servlet was healthy throughout that
pass (`749/750/751/787/788/790` returned real PDFs), so the empty response at `755` is specific to that
record — not a servlet fault, not rate-limiting.

---

## §10 — The decisive artifact: the portal's own "**Versions téléchargeables actuelles**" bundle

`Portal.jsp?page_id=4` ("Documentations") exposes a **servlet not previously mapped anywhere in this
document**. It is *not* the `document/resource` endpoint of §1:

```
https://regles-urbanisme.paris.fr/plu-bioclimatique/servlet/plugins/plubio/download?id=<N>
```

It sits under the page heading **"Versions téléchargeables actuelles / L'intégralité des documents en PDF"**.
Headers observed:

| id | `Content-Disposition` | `Content-Length` | type |
|---:|---|---:|---|
| **49** | `attachment;filename=PLU bioclimatique.zip` | **2,420,558,473** | `application/zip` |
| 31 | `attachment;filename=PSMV du 7e arrondissement.zip` | 579,214,292 | `application/zip` |
| 41 | `attachment;filename=PSMV du Marais.zip` | 546,522,558 | `application/zip` |

Ids 1/2/3/10/20/30/40/45/46/47/48/50/51/52 on that servlet returned 200 with 0 bytes — so `49` is the
**only** current PLU-bioclimatique bundle.

**Two obstacles, both recorded rather than assumed:**

1. **Range requests are not honoured.** `Range: bytes=0-99` returned **`HTTP 200`, not `206`**, with no
   `Accept-Ranges` and the full `Content-Length`. The central directory could not be cherry-picked.
2. **The ZIP uses data descriptors** (first local header: `flags=0x808`, `csize=0`, `usize=0`), so member
   sizes are absent from local headers and streaming extraction was not possible either.

⇒ The whole bundle had to be pulled. **2,420,558,473 bytes received — exactly matching `Content-Length`** —
in 94.2 s at ~25.7 MB/s, one request, no retries.

**Bundle contents: 570 entries, 482 real files.** Every member carries mtime `2026-07-31 02:02` — the
archive is **assembled on demand from live portal content**, so it is the portal's own answer to
"what is current", not a stale pre-built file.

```
Règlement/Pièces écrites/Tome 1/REG1.pdf                    5,926,863
Règlement/Pièces écrites/Tome 2/REG2A1.pdf                  4,225,963
Règlement/Pièces écrites/Tome 2/REG2A10_1DE2.pdf            6,028,414
Règlement/Pièces écrites/Tome 2/REG2A10_2DE2.pdf            6,687,679
```

### ⇒ VERDICT (TASK 1): **NEGATIVE, AND PROVEN.** The portal still serves Version 59 as its current Tome 1.

| | value |
|---|---|
| bundle member | `Règlement/Pièces écrites/Tome 1/REG1.pdf` |
| bytes | 5,926,863 |
| **SHA-256** | **`29bc4a649a46c0dceedfbcd6f54223a763951e652ae62135c0e1fcc91a27f96a`** |
| SHA-256 of `resource?id=191` | **`29bc4a649a46c0dceedfbcd6f54223a763951e652ae62135c0e1fcc91a27f96a`** — **identical** |
| pages | 250 |
| PDF metadata title | `Microsoft Word - REG1_MS1` |
| PDF creationDate | `D:20260105172124+01'00'` |

Title page, read from the **bundle copy** (not from `id=191`), verbatim:

> PROJET POUR APPROBATION
> ANNEXE 1 AU PROJET DE DÉLIBÉRATION 2024 DU 142 – OCTOBRE 2024
> RÈGLEMENT TOME 1 · Modalités d’application du règlement · Dispositions générales · Règlements des zones
> **VERSION APPROUVÉE PAR DÉLIBERATION DU CONSEIL DE PARIS DES 16, 17, 18 ET 19 DÉCEMBRE 2025**

Page 2 running header: `PLU DE PARIS — 2 / 250 — DÉCEMBRE 2025`.

**The internal filename corroborates the title page**: `REG1_MS1` = Modification simplifiée n°**1**.
The current procedure is n°**2**. Two independent in-document signals, one conclusion.

**No June 2026 Tome 1 exists on the portal.** Not behind JS, not in the bundle, not at any resource id
in the swept ranges. Corroborated by a third, independent route — the portal's *own full-text index*
(`servlet/plugins/recherche?motCle=…`, discovered in `js/script_results_recherche.js`), which returns
exactly one "Règlement – Tome 1" hit and links it to **`resource?id=191`**.

---

## §11 — …and that is **CORRECT**, not a defect: Modification simplifiée n°2 never touched Tome 1

The bundle ships the procedure's own paperwork, which settles the delta question §3 could only call
*"likely, not proven"*.

**`Anciens PLU/20260616_MAJ2.pdf`** — 94,170 B, 2 pp — is Délibération **2026 DU 41-2** in full:

> Séance du 16, 17, 18 et 19 juin 2026 — **2026 DU 41 - 2 PLU - Modification simplifiée n° 2 - Bilan de
> la mise à disposition et approbation du projet.**
> *Article 2 :* La modification simplifiée n° 2 du PLU de Paris est approuvée conformément aux
> dispositions du Rapport de présentation de la procédure figurant en annexe n° 2…

**`Rapport de présentation/RP_MS2_260616.pdf`** — 5,796,090 B, SHA-256
`8aa17ad7234dc4fb417d8956abeaf6e9b85abacbce573a3ff519e8e1212cdb59`, 36 pp, internal title
`2026 DU 41_MS2_Annexe2_RPvf.docx` — is that annexe. Its §1.1 states the scope verbatim:

> La procédure porte sur la **mise en cohérence du règlement graphique** avec le programme de deux
> opérations d’aménagement en cours de réalisation … la suppression de prescriptions localisées et
> l’ajout d’une mesure de protection du patrimoine.

Its §2, *"Les dispositions du PLU modifiées"*, is an exhaustive list of **seven** changes:

| § | change | instrument touched |
|---|---|---|
| 2.1 | Ajout de **quatre périmètres de hauteur maximale des constructions (HMC)**, Python-Duvernois, 20e | **atlas n° 2** |
| 2.2 | Ajout de **deux périmètres HMC**, Bédier-Oudiné, 13e | **atlas n° 2** |
| 2.3 | Suppression d’un emplacement réservé pour espace vert, 9-11 rue d’Alleray, 15e | **Annexe V** + atlas n° 2 |
| 2.4 | Suppression d’un ER logement social, 9 rue Notre-Dame des Victoires, 2e | **Annexe IV** + atlas n° 2 |
| 2.5 | Suppression d’un ER logement social, 54 av. Victor Hugo, 16e | **Annexe IV** + atlas n° 2 |
| 2.6 | Suppression d’un ER logement social, 31 rue du Poteau, 18e | **Annexe IV** + atlas n° 2 |
| 2.7 | Ajout d’une protection du patrimoine architectural, 6 Cité Véron, 18e | **Annexe X** + atlas n° 2 |

**Every one targets the atlas or an Annexe. Annexes IV, V and X live in Tome 2. Not one targets a
written article of Tome 1.** Keyword scan of all 36 pages: `plan général des hauteurs` **0 hits**;
`3.2` appears only in the table of contents and on p24; no `UG.x.y` article citation anywhere.

⇒ This explains the timestamp pattern §3 read as suspicious: **ids 188/189/190 (Tome 2) carry
2 Jul 2026 because Annexes IV/V/X changed; id 191 (Tome 1) carries 10 Jun 2026 because nothing in it
changed.** The Dec 2025 title page is not stale — it is *accurate*. Version 59's Tome 1 text **is** the
operative Tome 1 text under Modification simplifiée n°2.

**⇒ P8 upgraded: `ASSERTED (partial check)` → `VERIFIED`.** §3's HTML-vs-PDF single-article comparison
reached the right answer; the procedure's own rapport now proves it for the whole tome, not just UG.3.2.

### ⚠ The trap inside the answer: textual delta **zero**, spatial delta **non-zero**

§2.1 and §2.2 add **six new HMC perimeters**. HMC is precisely the instrument whose substitution rule
§4 documented — it *substitutes for* the Plan général des hauteurs and *disapplies* the gabarit-envelope
inside its perimeter. So MS n°2 changed **which parcels are governed by the substitution**, while
changing **not one word of the rule that performs it**.

⇒ **"The text is unchanged" and "the height outcome is unchanged" are different claims.** An engine
that diffed règlement prose to decide whether to re-ingest would have concluded "no change" and silently
carried six perimeters' worth of wrong heights. Version-tracking for Paris must watch the **graphical
atlas and the GIS layers**, not only the tome PDFs. Same family as the `context-data-honesty` failures:
the cheap signal and the load-bearing signal are not the same value.

---

## §12 — §5 CLOSED: `plub_hauteur` **is** the *Plan général des hauteurs*

### §12.1 — `id=137` self-identifies (§8's lead was right; §5's `id=239` was the wrong plate)

`DG_E_HAUTEUR.pdf`, taken from the **current bundle** at
`Règlement/Documents graphiques/Atlas 1/DG_E_HAUTEUR.pdf` — 6,075,133 B (identical in size to
`resource?id=137`), SHA-256 `7bdbd9d4bc1c042435b1e5844d7f44b0ca5b8570ecba4d35205dccd241f7023f`,
1 page, producer `Esri ArcMap 10.9.1.28388`, created 2024-11-26.

Unlike `id=239`, this plate **has a title block**, and it reads verbatim:

> **E - PLAN GÉNÉRAL DES HAUTEURS**
> Echelle : 1/25 000
> Zones Urbaines — **Hauteur plafond en mètre** — `25` `31` `37` `18`
> Zone Naturelle et forestière
> Territoires couverts par les fuseaux de protection du site de Paris
> **PLU de Paris — Approuvé par délibération du Conseil de Paris du 20 novembre 2024**

⇒ §8 was right that a page-asserted label beats a range-swept filename. `id=137` **is** the *Plan
général des hauteurs*. §5's `id=239` (`Plan___Hauteurs_des_constructions.pdf`) is a different, untitled
plate and should be dropped as evidence.

### §12.2 — The provenance statement, verbatim

`opendata.paris.fr` dataset **`plub_hauteur`**, titled **"PLU bioclimatique - Plafonds des hauteurs"**.
Producer (`metas.dcat.creator`), verbatim:

> **Mairie de Paris / Direction de l'Urbanisme / SEISUR / BDPC**

The dataset carries exactly **one** attachment — `Plafond des hauteurs.pdf` (183,203 B, SHA-256
`930e895bf52f64bbce03c6b0fc3f4686af7e5a32b1895c6f0f962ab99be9f3ae`, 1 p., authored *Priou, Jean-Yves*,
Word 2019, created 2025-02-13). Its **généalogie statement**, quoted verbatim and in full:

> Données numériques du Plan Local d’Urbanisme de Paris — **Plafond des hauteurs**
>
> Cette couche fait partie des données numériques du Plan Local d’Urbanisme de Paris. **Ces données sont
> utilisées pour réaliser les documents graphiques et les tableaux annexes du règlement.**
>
> **Nom de la couche : plub_hauteur**
> Géométrie : Surfaces
> **Contenu : Le plan « E – Plan général des hauteurs » des documents graphiques du règlement fixe la
> hauteur plafond, mesurée à partir de la surface de nivellement de l’îlot, que toute construction doit
> respecter dans les zones urbaines du PLU. Cette hauteur plafond est indiquée en mètre par la légende
> du plan. Les valeurs possibles sont : 18m, 25m, 31m et 37m. En fonction de l’emplacement de la
> construction, d’autres règles peuvent également s’appliquer et limiter sa hauteur à une valeur
> inférieure à la hauteur plafond.**
> Cette couche contient une partition des zones urbaines selon la hauteur plafond et l'arrondissement.
>
> **Documents du PLU : Ces données apparaissent sur le plan « E – Plan des hauteurs ».**
>
> **Actualité : Dernière modification le 20/11/2024 – Approbation du PLU bioclimatique.**
> Précision : Plans au 1/12500.
> Champs de la table associée :
> • n_sq_ca : numéro de l’arrondissement.
> • hauteur : hauteur plafond en mètre.

⇒ **P7 is now VERIFIED.** The published layer and the legal instrument have **not** diverged — the
documentation names the plan *"E – Plan général des hauteurs"* explicitly, and that is the same string
the plate's own title block carries. UG.3.2.2's substitution rule therefore **does** map cleanly onto
`plub_hauteur`, and a resolver may wire it that way.

**Three refinements that matter more than the yes/no:**

1. **The layer is UPSTREAM of the plate, not derived from it.** *"Ces données sont utilisées pour
   réaliser les documents graphiques"* — the GIS layer is the source from which the PDF plate is
   rendered. So `plub_hauteur` is the *better* artifact to ingest, not a lossy copy of a map.
2. **Height is measured from the *surface de nivellement de l'îlot*** — a per-**block** levelling
   surface, not a single sampled point. Direct, citable support for **L-584**
   (`terrain-rasant-is-a-legal-defect`): sampling one elevation at a block centroid is not what the
   ordinance measures.
3. **The layer is pinned two procedures behind.** *"Dernière modification le 20/11/2024"* = the révision
   (Version 57). It predates **both** Modification simplifiée n°1 (Dec 2025 → V59) **and** n°2
   (Jun 2026 → current). Given §11's §2.1–2.2 added six HMC perimeters, **`plub_hmc` must be assumed
   stale on the same grounds** until separately checked.

The final sentence of *Contenu* — *"d'autres règles peuvent également s'appliquer et limiter sa hauteur
à une valeur inférieure"* — is the **producer's own confirmation of §4's cumulative-application model**,
from a source independent of both the règlement text and the HTML consultation.

### §12.3 — Layer shape (live, Explore v2.1 API)

**Feature count: `total_count` = 116.** Field names exactly as returned:

| field | type | description (as published) |
|---|---|---|
| `objectid` | int | — |
| **`hauteur`** | int | **"Hauteur plafond en mètre"** |
| `n_sq_ca` | int | "Numéro d'arrondissement" |
| `st_area_shape` | double | — |
| `st_perimeter_shape` | double | — |
| `geo_shape` | geo_shape | — |
| `geo_point_2d` | geo_point_2d | — |

Value distribution of `hauteur` (server-side `group_by`): **18 m ×6 · 25 m ×31 · 31 m ×31 · 37 m ×48 = 116.**
Exactly the four values in the plate's legend (`25 31 37 18`) and exactly the four the documentation
enumerates — a clean three-way cross-validation of layer ↔ plate ↔ documentation.

Licence ODbL; `metas.default.publisher` = *Direction de l'Urbanisme - Ville de Paris*; the dataset
repeats the familiar disclaimer *"Données disponibles pour information et sans valeur réglementaire"*,
consistent with §4.

---

## §13 — INDEPENDENT CONFIRMATION: the national GPU serves the *same bytes*

Article 3 of Délibération 2026 DU 41-2 (§11) requires publication on the **Géoportail de l'Urbanisme**,
the national portal under art. L.133-1 C. urb. That is an authority independent of the Ville de Paris
CMS — a different operator, a different origin (`data.geopf.fr`). It was probed as a second source, per
the standing rule that a single portal's claim is not evidence.

**The working API filter is `partition=DU_75056`.** (`?insee=75056` returns **HTTP 200** but *silently
ignores the filter* — it returned Finistère `SUP_29_AC2` records. A caller who trusted it would have
concluded "Paris is absent". Recorded here so nobody repeats it.)

The one Paris PLU record in force:

```
id:              ab895285a1be6ca045127a6bb628cfaa
originalName:    75056_PLU_20260616
status:          document.production
legalStatus:     APPROVED
effectiveStatus: EN_VIGUEUR
publicationDate: 23/06/2026 10:01:59
title:           "Plan Local d'Urbanisme (PLU) de la commune de PARIS"
producer:        "Direction de l'Urbanisme de la Ville de Paris, 121 avenue de France…"
```

The prior MS n°1 record (`75056_PLU_20251219`) is now `status: document.lost`, `statusDate: 22/06/2026` —
the GPU's own supersession marker, matching the 23 Jun 2026 effective date.

⚠ **The GPU exposes no free-text approval-date field** — `20260616` is only an encoded filename, and by
the rules of §3 that is inadmissible. The admissible evidence is a document *inside* the set:
`75056_20260616_delib_approbation_MS2_20260616.pdf` (94,170 B), whose page 1 carries
`2026 DU 41 - 2 … Séance du 16, 17, 18 et 19 juin 2026`.

### The decisive comparison

The GPU's 323-file set contains exactly **one** non-graphic règlement PDF,
`75056_reglement_20260616.pdf` (served via 302 → `data.geopf.fr/annexes/gpu/documents/DU_75056/…`):

| | Ville de Paris (`id=191` **and** the 2.42 GB bundle) | GPU (`75056_reglement_20260616.pdf`) |
|---|---|---|
| bytes | 5,926,863 | **5,926,863** |
| SHA-256 | `29bc4a64…1a27f96a` | **`29bc4a64…1a27f96a`** |
| PDF internal title | `Microsoft Word - REG1_MS1` | `Microsoft Word - REG1_MS1` |
| title-page approval | **16–19 DÉCEMBRE 2025** | **16–19 DÉCEMBRE 2025** |
| pages | 250 | 250 |

⇒ **Three independent routes — the orphan resource id, the portal's own current bundle, and the national
GPU — return the identical artifact, byte for byte.** Note the filename `…_20260616.pdf` reports June
2026 while the document's own title page reports December 2025: **the same header-vs-title-page lie §3
recorded, reproduced verbatim on a second portal.** The hash proves the file is the same one.

This is the strongest possible form of the §10 verdict: the December 2025 Tome 1 is not a Ville-de-Paris
publishing slip. It is **the legally published, in-force Tome 1 of the current PLU**, and §11 explains why
that is correct.

### Two gaps left open by the GPU probe

1. **The GPU set appears incomplete on the written annexes.** MS n°2 modified Annexe V (rue d'Alleray)
   and Annexe IV/X — all of which live in **Règlement Tome 2** — yet the 323-file GPU set contains **no
   Tome 2 règlement PDF at all**. The Ville de Paris portal *does* carry current Tome 2 (ids 188/189/190,
   refreshed 2 Jul 2026). ⇒ **For Paris Tome 2, prefer the municipal portal over the GPU.**
2. `…/api/document/{id}/metadata` is **auth-gated (302 → `/login`)**, so the INSPIRE record
   `fr-000075056-plu20260616` was not read; it may carry a structured approval date.
3. The `pack_plu2` archive ZIP (`archiveUrl` → `data.geopf.fr/telechargement/download/pack_plu2/…`)
   returned **200** but was not downloaded — same origin and document id as the per-file endpoint, so
   divergence is unlikely but **unverified**.

---

## §14 — Reproduction

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
H="https://regles-urbanisme.paris.fr/plu-bioclimatique"

# 1. The broken Tome 1 link (§9) — grep the rendered Règlement page
curl -sS -A "$UA" "$H/jsp/site/Portal.jsp?document_id=198&portlet_id=45" | grep -o 'href="id=755"'
curl -sS -A "$UA" -o /dev/null -w '%{http_code}\n' "$H/jsp/site/Portal.jsp/../id=755"   # 404

# 2. The three-way outcome discriminator (§9.1) — note Last-Modified presence/absence
for id in 188 755 999999; do
  curl -sS -A "$UA" -o /dev/null -D - \
    "$H/servlet/plugins/document/resource?id=$id&id_attribute=93&nocache=true&working_content=true" \
    | grep -iE 'content-(disposition|length)|last-modified'
done

# 3. The current bundle (§10). Range is NOT honoured — this pulls all 2.42 GB (~95 s @ 25 MB/s).
curl -sS -A "$UA" -o PLU_bioclimatique_current.zip "$H/servlet/plugins/plubio/download?id=49"
python - <<'PY'
import zipfile, hashlib
z = zipfile.ZipFile("PLU_bioclimatique_current.zip")
raw = z.read("Règlement/Pièces écrites/Tome 1/REG1.pdf")
print(len(raw), hashlib.sha256(raw).hexdigest())   # 5926863 29bc4a64…1a27f96a
PY

# 4. The portal's own full-text index (§10) — endpoint is in js/script_results_recherche.js
curl -sS -A "$UA" "$H/servlet/plugins/recherche?motCle=Tome%201&rechercheTitre=false&rechercheContenus=true&rechercheExpression=false"

# 5. plub_hauteur provenance (§12) — the attachment IS the généalogie statement
curl -sSL "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/plub_hauteur" | jq '.metas.dcat.creator, .metas.default.records_count'
curl -sSL -o "Plafond_des_hauteurs.pdf" \
  "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/plub_hauteur/attachments/plafond_des_hauteurs_pdf"

# 6. The national GPU (§13) — partition=, NOT insee=
curl -sSL "https://www.geoportail-urbanisme.gouv.fr/api/document?partition=DU_75056"
```

Browser-automation harness: **`tools/paris-portal-probe/probe.mjs`** (Playwright 1.59.1, `channel:'chrome'`,
serialised, 1.2 s inter-action delay). It records every request/response with redirect chain,
`Content-Type`, `Content-Disposition`, `Content-Length` and `Last-Modified`; inventories every anchor,
button, `[onclick]`, `data-*` and `<form>`; clicks each on a **fresh page**; and classifies the outcome as
one of `download` / `navigation-to-binary` / `navigation-to-html` / `xhr-only` / `nothing` /
`control-not-found-on-reload` / `error` — so "the control fired nothing" never collapses into "the
control failed".

**In every case above: read the PDF's title page. Never infer a version from a header, a filename, or an
`id`.** §13 shows the same file published under a `…_20260616.pdf` filename on one portal and an
orphaned `id=191` on another, with a December 2025 title page in both.

---

## §15 — Evidence chain, extended (G11)

| # | Claim | How obtained | State |
|---|---|---|---|
| P7 | **`plub_hauteur` = the *Plan général des hauteurs*** (§12) | dataset's own attached documentation names *"E – Plan général des hauteurs"*; `id=137` plate title block carries the identical string; 116 features with `hauteur ∈ {18,25,31,37}` matches the plate legend exactly | **VERIFIED** (was ASSERTED-UNVERIFIED) |
| P8 | **MS n°2 did not change UG.3.2 — or any Tome 1 text** (§11) | `RP_MS2_260616.pdf` §2 enumerates all 7 changes; every one targets atlas n°2 or Annexe IV/V/X (Tome 2) | **VERIFIED** (was ASSERTED, partial) |
| P9 | **The June 2026 Tome 1 binary does not exist** (§10, §13) | SHA-256 identity across three independent routes: `id=191`, the portal's own current 2.42 GB bundle, and the national GPU | **VERIFIED (negative)** — was UNKNOWN |
| P13 | Tome 1 **is** linked from `document_id=198`, via a malformed `href="id=755"` that resolves to **404** | rendered DOM + live request | **VERIFIED-LIVE** — *corrects §8's "not linked at all" and its client-side-JS hypothesis* |
| P14 | Resource `755` = **EMPTY-BUT-EXISTS** (200, 0 bytes, `Last-Modified` present), distinct from ABSENT (`999999`, no `Last-Modified`) | controlled 3-way comparison + 11-route sweep | **VERIFIED-LIVE** |
| P15 | `servlet/plugins/plubio/download?id=49` = the only current bundle, 2,420,558,473 B; **Range unsupported** (200, not 206); ZIP uses **data descriptors** | headers + local-header parse | **VERIFIED-LIVE** |
| P16 | The bundle is **generated on demand** (all members mtime 2026-07-31 02:02) — so it is the portal's live answer, not a stale build | central directory | **VERIFIED** |
| P17 | The portal's **own search index** returns one "Règlement – Tome 1" and links it to `id=191` | `servlet/plugins/recherche` | **VERIFIED-LIVE** (3rd corroboration) |
| P18 | GPU: `partition=DU_75056` is the working filter; **`insee=` is silently ignored** (returns 200 + wrong département) | live API | **VERIFIED-LIVE** |
| P19 | GPU in-force record `75056_PLU_20260616`, `EN_VIGUEUR`, published 23/06/2026; prior MS n°1 set marked `document.lost` | GPU API `…/details` | **VERIFIED-LIVE** |
| P20 | GPU's `75056_reglement_20260616.pdf` is **byte-identical** to `id=191` (`29bc4a64…`) despite its June-2026 **filename** | SHA-256 both sides | **VERIFIED** — *the §3 trap, reproduced on a second portal* |
| P21 | **MS n°2 changed height DATA (6 new HMC perimeters) while changing zero règlement text** | `RP_MS2_260616.pdf` §2.1–2.2 | **VERIFIED** |
| P22 | `plub_hauteur` is pinned to **20/11/2024** (Version 57) — two procedures behind the in-force PLU | dataset documentation, *Actualité* line | **VERIFIED** |
| P23 | Paris height is measured from the **surface de nivellement de l'îlot** (per-block levelling surface) | `Plafond des hauteurs.pdf`, *Contenu* | **VERIFIED** — direct support for **L-584** |
| P24 | GPU's Paris set contains **no Règlement Tome 2** although MS n°2 modified Annexes IV/V/X | GPU 323-file listing | **VERIFIED (negative)** — prefer the municipal portal for Tome 2 |
| P25 | GPU `…/metadata` is **auth-gated** (302 → `/login`); `pack_plu2` ZIP returned 200 but was **not** downloaded | live | **UNVERIFIED — open** |

### What this changes for the engine

1. **Ingest `REG1.pdf` `sha256:29bc4a64…` as the current Tome 1.** It is not a fallback and not stale;
   it is the in-force text, confirmed by the national portal. Pin the **hash**, not the id or the date.
2. **`id=191` is safe to use, but only because it happens to match.** It is still an orphan reachable
   only by direct URL. Prefer `plubio/download?id=49` (municipal, current-by-construction) or the GPU
   `partition=DU_75056` route, both of which are navigable and self-describing.
3. **Wire `plub_hauteur` to UG.3.2.2's substitution rule** — P7 is closed. But treat it as **two
   procedures stale**, and treat `plub_hmc` as stale on the same grounds (six perimeters added by MS n°2).
4. **Paris version-tracking must watch the graphical atlas and the GIS layers, not the tome PDFs.**
   Under MS n°2 the tome hashes are *unchanged by design* while the height outcome changed. A
   text-diff-triggered refresh would have missed it entirely.
