# Clau sourcing — ROUND 2. Four named targets, not open research.

Round 1 (`L-587-…-SOURCING-FINDINGS.md`) established the base-PGM **article structure** for 22a and
20a and proved which portals block automation. **It encoded nothing**, because in every case the
specific number was one document away.

**Round 2 is a RETRIEVAL job with four named targets.** Do not re-research the structure.

⚠ It has two halves and they are not interchangeable:
- **PART A — a HUMAN in a browser.** Only this can produce Barcelona-verified numbers, because
  Barcelona's own PIU is a parcel-search tool that refuses automation. Coordinates supplied.
- **PART B — a browsing AI**, for the four document-retrieval targets.

**Do Part A first.** One captured PIU qualification sheet outranks any amount of Part B.

---
---

# PART A — the human-in-a-browser task (highest value)

**Tool:** Barcelona's *Portal d'Informació Urbanística* —
`ajuntament.barcelona.cat/informaciourbanistica/cerca/` (robots-disallowed to machines; fine for you).

**What you are producing:** for each coordinate below, the parcel's **qualification sheet** — the
page listing the clau and its parameters. The Zona Franca PDF found in round 1 was exactly such a
printout, which is why it was the only Barcelona-verified artefact in the whole run. **Save each as
PDF/screenshot and note the URL.**

**These coordinates are REAL Barcelona points, from our own live MUC query, filtered to INE 08019.**
Each is confirmed to return the stated clau. Enter as lat, lon.

### clau 22a — *Zona industrial* (17.5% — top priority)
```
41.32240, 2.13840      41.33320, 2.13480      41.34670, 2.14560
41.32780, 2.12040      41.33860, 2.13480
```
⚠ These sit in/around the Zona Franca–Port industrial belt. **Round 1 already has the S164 Pla
Parcial.** What is needed is a 22a parcel governed by the **generic PGM Art. 350**, not by a Pla
Parcial. If the sheet cites a Pla Parcial, note that and try the next coordinate.

### clau 12 — *Nucli Antic de Substitució* (9.5% — and it DOES apply to Barcelona, see §Correction)
```
41.37100, 2.13480   (Sants)          41.40070, 2.16000   (Gràcia)
41.37910, 2.13480   (Sants/Hostafrancs) 41.40340, 2.15640 (Gràcia)
41.39800, 2.16000   (Gràcia)         41.40880, 2.18880   (Camp d'en Grassot / Sant Andreu side)
```

### clau 20a and variants — *edificació aïllada* (~10%)
```
20a      41.42230, 2.08800   41.42500, 2.09520   41.43040, 2.09520   (Vallvidrera / Les Planes)
20a/10   41.40340, 2.12400   41.40880, 2.10240   41.41420, 2.10240   (unifamiliar)
20a/9    41.41690, 2.13480   41.42230, 2.16000                        (plurifamiliar)
20a/11   41.38990, 2.10600   41.39800, 2.11680                        (unifamiliar)
20a/12   41.39260, 2.10240                                            (unifamiliar)
```

### For each sheet, capture — and do not paraphrase:
1. the **clau** the parcel actually carries (confirm it matches);
2. **height** (m and/or storeys) and the **article** cited;
3. **edificabilitat** and its article;
4. **occupation %** and its article;
5. **setbacks / alignment / depth** and its article;
6. any **Pla Parcial, Pla de Millora or modificació** named on the sheet;
7. **the URL and the date.**

⚠ **If a field is blank on the sheet, that is the answer — record "blank on sheet".** Do not fill it
from anywhere else.

---
---

# PART B — the browsing-AI prompt (copy everything below the line)

---

You are a **planning-law researcher**. This is a **narrow retrieval task**, not open research. A
previous pass already established the structure; four specific things are missing. **Getting one of
them with a verbatim quote is a complete success. Do not pad the answer with the parts already
known.**

Context: I build a tool that computes what may legally be built on a plot in **Barcelona (INE
08019)** under the **Pla General Metropolità (PGM 1976), Normes Urbanístiques**. Every number is
shown to a professional with its ordinance citation, so **a wrong number is worse than no number**.

## ALREADY ESTABLISHED — do not re-derive, do not restate

For clau **22a** *(Zona industrial)*, **PGM Art. 350** provides:
- `350.a` — edificabilitat ≤ **2 m² sostre/m² sòl**; occupation **90%**
- `350.b` — above ground floor, building must sit within a concentric band = **70%** of the block
- `350.c` — **height varies with street width**, *"de conformitat amb el quadre següent"*
- `350.e` — height inside the block fixed at **5 m** from the *rasant*

For clau **20a** *(edificació aïllada)*: **Art. 337** definition, **Art. 338** nine subzones
(I–V plurifamiliar, VI–IX unifamiliar), **Art. 340** the edificabilitat index article.

⚠ All of the above comes from **Castelldefels (INE 08056)** and other non-Barcelona transcriptions.

## ⚠⚠ A CORRECTION YOU MUST CARRY — the previous pass got this wrong with its highest confidence

It concluded, citing **PGM Art. 315.2** — *"subzona I… (12), d'aplicació a tots els nuclis antics
diferents del de Barcelona, i una subzona II… (12b), referida preferentment a aquell"* — that **clau
12 does not apply to Barcelona**.

**The quote is right; the inference is wrong.** *"El nucli antic **de Barcelona**"* means **Ciutat
Vella**, not the municipality. Barcelona absorbed formerly independent towns — **Gràcia, Sarrià,
Sants, Sant Andreu, Horta** — each with its own *nucli antic*, which are literally *"nuclis antics
diferents del de Barcelona"*. Our own live cadastral/zoning query inside INE 08019 returns **26
points of clau 12** spread across the municipality against only **5 of 12b**, tightly clustered on
Ciutat Vella. **Clau 12 governs the annexed villages' old cores. Do not repeat the earlier
conclusion.**

## THE FOUR TARGETS

**① The Art. 350.c width→height TABLE for clau 22a.** *(highest value)*
The previous pass retrieved the sentence saying a *quadre* exists but never the *quadre*. **That
table IS the height rule.** I need the rows — each street-width band and its height in metres and/or
storeys — verbatim. Any municipality's transcription is useful as base-PGM structure, but **say
which INE code it came from.**

**② Is Art. 350 modified for Barcelona (08019)?**
Everything held is Castelldefels's transcription. Evidence *for* it being unmodified: the Zona Franca
Pla Parcial S164 document cites **"art. 350.1 de les NNUU del PGM"** directly, implying Barcelona
uses the same numbering. I need either (a) Barcelona's own transcription of Art. 350, or (b) a
*modificació* that amends it for 08019, or (c) a well-evidenced "no modification found, and here is
where I looked". **All three are useful answers.**

**③ The text of Art. 340** — the edificabilitat article for clau 20a. Never retrieved. If it is an
index pointing at a per-subzone table, I need **that table**.

**④ Clau 12's parameters — asked correctly this time.**
Not *"Barcelona's historic centre"* but: **what does clau 12 (subzona I, substitució de l'edificació)
prescribe for height, edificabilitat, occupation and setbacks/depth, and does any of it vary with
street width?** These apply to the annexed nuclis antics listed above. Give the article numbers.

## SOURCES, in order of authority
1. **RPUC** — `dtes.gencat.cat/rpucportal/` (consolidated *refós*)
2. **AMB geoportal** — `geoportalplanejament.amb.cat/Informacio/Normativa/<INE>_<clau>.htm`
   ⚠ 404s on direct fetch though indexed; search-result snippets and caches may still yield fragments
3. **BCNROC** — Barcelona's document repository
4. **DOGC / BOPB** — for *modificacions*. Round 1 saw a metropolitan-wide modification referenced as
   **exp. 2007/028428** affecting the 20a articles — **chase that reference**; a metropolitan-wide
   modification WOULD apply to Barcelona
5. Any archived **PIU printout** (the Zona Franca PDF proves these exist in the wild — look for others)

## THE RULES — unchanged, and they matter more than completeness
1. **VERBATIM QUOTE OR IT DOESN'T COUNT.** No quote ⇒ mark `NOT FOUND` and say what you tried.
2. **"NONE STATED" IS A RESULT.** Never fill a gap with a plausible number.
3. **ALWAYS STATE THE INE CODE** a figure came from. `08019` = Barcelona. Anything else is base-PGM
   evidence at best, and may be that municipality's own local modification — two failure modes that
   look identical until the code is checked. (Round 1: the "100% occupation" figure turned out to be
   **Badia del Vallès's own Art. 23**, not base PGM.)
4. **NEVER INFER ACROSS CLAUS OR MUNICIPALITIES.**
5. **IF A RULE IS AN ALGORITHM, GIVE THE ALGORITHM** — inputs, caps, floors — not a worked example.
6. **DO NOT RECONCILE CONFLICTS.** Report both with citations.
7. **SEPARATE THE CITATION FROM THE INFERENCE.** State the quote, then state what you conclude from
   it, as two distinct things. **The previous pass's single biggest error was a correct quote with a
   wrong inference, carrying its highest confidence** — that error was only catchable because the
   quote was preserved.
8. **REPORT WHAT BLOCKED YOU**, naming the document and the step.

## FINALLY
End with **"What I would NOT rely on"** — everything you produced that you would not stake a
professional opinion on, and why. **Four solid parameters and eleven honest gaps beats fifteen
parameters of unknown quality.**

---
