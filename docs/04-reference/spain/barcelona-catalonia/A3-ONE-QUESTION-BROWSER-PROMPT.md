# A3 — the one question that unblocks clau 13b (browser-agent prompt)

Paste everything below the line into a session **with a real browser**. AMB 403/404s to scripted
fetch and Barcelona's own book page is robots-disallowed — that asymmetry is the entire reason a
human/browser is needed.

---

## Paste from here

I need **one** legal question answered about Barcelona's PGM-1976 urban-planning norms, plus a quick
secondary lookup. Accuracy matters far more than completeness: this becomes a legally-cited number
shown to architects. **"Not found" is a useful answer. A plausible guess is a harmful one.**

# THE QUESTION

> **Does PGM NNUU Art. 242's 30% interior-free-space rule apply to clau `13b` — *Densificació Urbana
> Semiintensiva*, "Subzona II" — governed by Art. 328?**

## Background you need to judge the answer

**Art. 242** derives *profunditat edificable* (buildable depth) — it does not state a number. It
defines the depth as a figure similar to the block, equidistant from the street frontages, leaving a
minimum share of the block as interior free space, capped at 30 m. That minimum share is stated
**per zone family**: **40%** for *nucli antic* subzona I, and **30%** for the *densificació urbana*
zones.

**Art. 328** governs `13b`. It sets *alçada reguladora màxima* and storeys from street width, and —
in every copy found so far — **contains no depth rule of its own.**

So the working assumption is that `13b`, being a *densificació urbana* subzone, inherits the **30%**
by category. **No sentence stating this has been found.** That is what I need.

## What a complete answer looks like — one of these four

1. **INHERITS** — Art. 328 (or Art. 242, or a linking article) says `13b` / Subzona II follows the
   general *densificació urbana* depth rule. → quote it.
2. **CARVED OUT** — a different ratio, a different construction, or a fixed depth applies to `13b`.
   → quote it, and give the figure.
3. **SILENT BUT DETERMINABLE** — nothing states it directly, but Art. 242's own wording scopes the
   30% to a zone family that demonstrably includes `13b`. → quote **Art. 242's scoping sentence
   verbatim**, so the inheritance can be judged rather than assumed.
4. **NOT FOUND** — say so, and say which document/page/click would settle it.

⚠ **Option 3 is the likely one. Its value depends entirely on the verbatim scoping sentence** — the
exact words Art. 242 uses to name which zones the 30% covers. Please prioritise capturing that
sentence exactly, in the original Catalan/Spanish, with a screenshot.

## ⚠ WHERE TO LOOK — and the trap that has already caught this twice

**USE:**
- **BCNROC** — Barcelona's own document repository: `bcnroc.ajuntament.barcelona.cat`
- **Ajuntament de Barcelona — urbanisme / informació urbanística**
- **RPUC** — `dtes.gencat.cat/rpucportal/`

**DO NOT USE as the answer:**
- **`geoportalplanejament.amb.cat/Informacio/Normativa/08XXX_*.htm`** — these are **per-municipality**
  consolidations keyed by **INE code**. **`08015` is BADALONA. Barcelona is `08019`.** Other codes
  seen: `08245`, `08123`. **The Badalona and 08245 copies of Art. 328 numerically DISAGREE with each
  other**, because each municipality layered its own *modificacions* onto the same article numbers.
- Municipal republications by **Santa Coloma de Gramenet, Badalona, Sant Cugat, Castelldefels,
  Gavà**. A document of exactly this kind was previously adopted as Barcelona's `13a` source and was
  stale, anachronistic and mis-attributed.

They are useful as **corroboration**, never as the answer. If that is all you can reach, say so
plainly and label it.

⚠ **Note even an `08019` AMB page is a COPY**: Barcelona compiles its own consolidated text and
delivers it to AMB annually, and its compilation differs conceptually from other municipalities'.
**Barcelona's own sources outrank the AMB mirror.**

## ⚠ A RED FLAG THAT LOOKS LIKE AN ANSWER

A previous search surfaced *"PB+2, alçada màxima 10,60 m, **profunditat edificable 18,00 m**"* for
`13b`. **A single fixed depth is INCOMPATIBLE with Art. 242's construction** — the whole point is
that depth is derived per block, so it differs block to block. If a source states one fixed depth for
`13b`, **that source is answering a different question or is a local modification**. Report it as a
counter-example, not as the answer.

---

# SECONDARY (5 minutes, only if the above is done)

Look up cadastral reference **`0230904DF3803`** — Carrer de Pau Claris 155, Barcelona, clau `13a` —
in Barcelona's **free, non-authenticated** portal:

**"Cerca del planejament, qualificacions i convenis"**
`https://ajuntament.barcelona.cat/ecologiaurbana/ca/serveis/la-ciutat-funciona/urbanisme-i-gestio-del-territori/informacio-urbanistica/recerca-del-planejament-qualificacions-i-convenis`

Report, each with a screenshot:
1. **Profunditat edificable** (m) — and whether it is stated per-parcel or for the whole *illa*.
2. **Ample oficial** of Carrer de Pau Claris at no. 155 — the **planned/official** width from the
   *secció de vial* layer, **NOT** a distance measured on the map.
3. **Alçada reguladora màxima** (m) and storeys (PB+N).
4. Whether this parcel carries any **MPGM / Pla Especial / modificació** overlay, or only standard
   PGM `13a`. (Pau Claris 158–160 nearby *is* modified; I need 155 itself.)

⚠ That portal's own disclaimer says its output is **informative, not normative** — so label these
`published`, never `certified`. A certified answer needs the formal *Certificat de règim urbanístic*.

---

# OUTPUT FORMAT

```
ANSWER:       INHERITS | CARVED OUT | SILENT BUT DETERMINABLE | NOT FOUND
VERBATIM:     <the exact sentence(s), original language, no paraphrase>
ARTICLE:      <article number and heading>
SOURCE:       <document title · authority · date · exact URL>
IS IT BARCELONA'S OWN? yes / no — if no, which municipality
CONFIDENCE:   certified | published | corroborated | inferred
SCREENSHOT:   <attached>
NOT FOUND:    <what you could not get, and which click/layer would reveal it>
```

**Keep these three separate and never merge them: what the document SAYS · what you INFERRED · what
you COULD NOT FIND.**
