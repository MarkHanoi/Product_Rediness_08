# Barcelona sourcing — browser-agent prompt (L-552 Art. 328 / Art. 316 + L-528 certification)

Paste everything below the line into a Claude chat (or any agent) **with real browser access**.
These sources 403/404 to headless fetch but serve a normal logged-in browser — that asymmetry is the
*only* reason this cannot be automated.

---

## Paste from here

You are helping certify Spanish urban-planning parameters for a BIM product that draws legally-cited
buildable envelopes. **Accuracy matters more than completeness: a wrong number here becomes a
confident legal claim shown to an architect. If you cannot verify something, say so explicitly —
"not found" is a useful answer and a plausible guess is a harmful one.**

Everything below concerns **Barcelona (municipality INE code 08019)** and its **PGM-1976 NNUU**
(Normes Urbanístiques del Pla General Metropolità), as currently consolidated.

### Where to look

- **RPUC** — Registre de Planejament Urbanístic de Catalunya: https://dtes.gencat.cat/rpucportal/
- **MUC visor** — Mapa Urbanístic de Catalunya: https://dtes.gencat.cat/muc-visor/
- **AMB Geoportal de Planejament**: https://geoportalplanejament.amb.cat/
- **AMB NUMAMB** (the consolidated NNUU text; 403s to scripts, fine in a browser)
- Ajuntament de Barcelona Seu electrònica — *Certificat de règim urbanístic*

---

## TASK A — Art. 328, clau `13b` (Densificació Urbana **Semi**intensiva)

Art. 328 is already confirmed as the governing article ("Condicions d'edificació: subzona II,
semiintensiva", NNUU Títol IV Cap. IV Secció 3, immediately after Art. 327 which governs `13a`).
**We need its numbers, not its identity.**

**A1. The full verbatim text of Art. 328** (Catalan or Spanish, as published).

**A2. Its height table.** Art. 328 determines *alçada reguladora màxima* and *nombre màxim de
plantes* from the width of the street the building faces. Report the table exactly:

| street-width band (m) | alçada reguladora màxima (m) | nombre de plantes (PB+N) |
|---|---|---|

**A3. ⚠ THE MOST IMPORTANT QUESTION — answer this even if you get nothing else.**
**Does PGM Art. 242's 30% interior-free-space rule apply, unmodified, to Subzona II (`13b`)?**
Art. 242.2 derives the *profunditat edificable* as "a figure similar to the block, equidistant from
the street frontages, leaving at least 30% of the block area as interior free space" (capped 30 m,
floored 11 m). Quote whatever article text settles it either way — inheritance, modification, or an
alternative depth rule specific to Subzona II.

**A4. Provenance** — document title, publication/consolidation date, issuing authority, and the exact
URL for each of A1–A3.

---

## TASK B — Art. 316, clau `12` (Nucli Antic)

**B1.** Full verbatim text of **PGM NNUU Art. 316**.
**B2.** Every buildable parameter it sets: depth, height, storeys, and how each is determined
(fixed value? keyed to street width? per-plot from a catalogue?).
**B3.** Whether Ciutat Vella's heritage catalogue overrides it, and if so whether that catalogue is
published as queryable data or only as PDFs.
**B4.** Provenance as in A4.

---

## TASK C — Certify one parcel (resolves a live 20.75 vs 22.40 m contradiction)

**Parcel:** Carrer de Pau Claris 155, Barcelona (Eixample) · cadastral ref **0230904DF3803** ·
zone **clau 13a**.

**C1.** *Profunditat edificable* (m) the plan assigns to THIS block/parcel. Note whether it is stated
per-parcel or derived for the whole *illa*.
**C2.** *Ample oficial* of Carrer de Pau Claris at no. 155 — the **planned/official** street width
from the *secció de vial* layer, **NOT** a distance measured on the map.
**C3.** *Alçada reguladora màxima* (m) and storeys (PB+N) for this parcel.

**⚠ C4 — THE ACTUAL QUESTION, and a bare number does not answer it.** Both **20.75 m** and
**22.40 m** are quoted for PB+5 on a ~20 m street. **Which applies here, and WHY do the two differ?**
The three candidate explanations each imply a completely different software change, so I need the
reason, not the winner:

- (a) a **parapet / barana** allowance added on top of the regulated height — then 20.75 m remains
  the correct *alçada reguladora* and 22.40 m is simply a different quantity;
- (b) a **planta sotacoberta** (attic storey) counted differently;
- (c) a **Barcelona-specific consolidation** that supersedes the generic PGM band table — this would
  be the biggest finding, because it would mean the band table is wrong for the whole city.

**C5.** Is `0230904DF3803` governed only by standard PGM `13a`, or by an **MPGM / Pla Especial /
modificació** overlay? (Pau Claris 158–160 nearby *is* modified; I need to know about 155 itself.)

---

## ⚠ ACCEPTANCE CRITERIA — read before you start, this decides whether the work is usable

1. **It must be Barcelona's OWN consolidation (INE 08019).** Municipal republications by **Santa
   Coloma de Gramenet, Badalona, Sant Cugat, Castelldefels or Gavà** are freely fetchable and are
   **NOT acceptable**. One of exactly that kind of document was previously adopted for `13a` and was
   stale, anachronistic and mis-attributed — it passed review anyway. If a source is another
   municipality's *refós*, say so and keep looking.

2. **A single fixed *profunditat edificable* for `13b` is a red flag, not a find.** A previous search
   surfaced *"PB+2, alçada màxima 10,60 m, profunditat edificable 18,00 m"*. A lone stated depth is
   **incompatible with the Art. 242 construction** that governs the *densificació urbana* zone. If a
   source states one fixed depth for `13b`, **that source is wrong for our purposes** — report it as
   a counter-example, not as the answer.

3. **Verbatim over paraphrase.** Quote the article text; do not summarise it into numbers.

4. **Screenshot every figure** with the layer/panel it came from visible.

5. **Distinguish these three explicitly, every time:** *what the document says* · *what you inferred*
   · *what you could not find*. Never merge them.

---

## Output format

For each of A, B, C:

```
FINDING:      <verbatim quote or table>
SOURCE:       <document title · authority · date · exact URL>
CONFIDENCE:   certified (official viewer/certificate) | published (official text) | unverified
SCREENSHOT:   <attached>
NOT FOUND:    <what you could not obtain, and which click/layer would reveal it>
```

**If you only manage one item, make it A3** — whether Art. 242's 30% rule applies to `13b`. That one
answer decides whether encoding `13b` is a week of configuration or a month of new rule design.
