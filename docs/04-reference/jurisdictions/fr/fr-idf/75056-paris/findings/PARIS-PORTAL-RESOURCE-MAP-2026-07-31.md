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
