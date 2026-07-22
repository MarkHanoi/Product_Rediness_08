# Clau rule-pack sourcing — the browser-AI prompt

**Purpose.** Get the PGM parameters for the next Barcelona *claus* (22a, 20a/\*, 12) out of sources
that refuse scripted access. Paste the block below into a browsing-capable AI chat (Claude, ChatGPT,
Gemini — ideally two of them independently, then compare).

**Why a human/browser AI and not our agents:** AMB 403s scripted fetch, the Ajuntament's ordinance
page is robots-disallowed, and the authoritative viewers are interactive. Four angles were tried in
one day and all failed. This is the one workstream that does not parallelise with engineers.

**Value:** these packs are the **+30.9 points** on the end-to-end ladder
(`GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` §2.0.3) — 3.7× the largest engineering item.

⚠ **RUN IT TWICE, IN DIFFERENT MODELS, AND COMPARE.** Disagreement between two independent runs is
the cheapest fabrication detector available. Agreement is not proof, but disagreement is proof of a
problem.

---

## THE PROMPT (copy everything below the line)

---

You are a **planning-law researcher**. I need you to extract specific, citable parameters from
Barcelona's urban planning ordinance. This is for a professional tool that shows architects and
developers what may legally be built on a plot, so **a wrong number is worse than no number**.

### WHAT I AM BUILDING, SO YOU UNDERSTAND WHY PRECISION MATTERS

We compute a *buildable envelope* per parcel and show the user which ordinance article produced
each figure. We never present a value without a citation. We have already encoded clau **13a**
(*Densificació Urbana Intensiva*, the Eixample) and learned three things the hard way:

- **PGM Art. 242.2 does not STATE a buildable depth — it states how to DERIVE one** ("a figure
  similar to the block, equidistant from the street frontages, leaving at least 30% of the block
  area as interior free space", capped 30 m, floored 11 m). Every "20 m" or "24 m" figure repeated
  online is one person's answer for one block. **Rules can be algorithms, not lookups. If a rule is
  a procedure, describe the procedure — do not hand me a number someone computed.**
- **13a legitimately has NO height table and NO edificabilitat (FAR).** Recording "none stated" was
  a genuine finding. **A blank is a valid, valuable answer.**
- We once cited the wrong article for the depth rule. **A confident citation to the wrong article is
  the most damaging possible output** — it looks authoritative and is unfalsifiable to the user.

### THE TASK

For **each** of the following *claus* of the **Pla General Metropolità (PGM 1976), Normes
Urbanístiques**, as applicable in the municipality of **Barcelona (INE 08019)**:

1. **`22a` — Zona industrial**  *(highest priority)*
2. **`20a` and its variants** (`20a/5`, `20a/8`, `20a/9`, `20a/10`, `20a/11`, `20a/12`, `20a/9u`) —
   *Ordenació en edificació aïllada* (unifamiliar / plurifamiliar)
3. **`12` — Nucli Antic de Substitució de l'Edificació**

…answer these **five questions**, and for each give the **article number** that states it:

| # | Question | Answer format |
|---|---|---|
| 1 | **Height** | metres and/or storeys (`PB+N`) — PGM Art. ___ |
| 2 | **Edificabilitat** (floor-area ratio) | m² sostre / m² sòl — PGM Art. ___ |
| 3 | **Occupation / coverage** | % of plot — PGM Art. ___ |
| 4 | **Setbacks OR alignment** | either front/side/rear in metres, **or** "alineació a vial + profunditat edificable" — PGM Art. ___ |
| 5 | **Street-width dependence** | does ANY of 1–4 vary with the width of the street (*amplada de vial*)? yes/no + Art. ___ |

### WHERE TO LOOK — in this order of authority

1. **RPUC** — Registre de Planejament Urbanístic de Catalunya (`dtes.gencat.cat/rpucportal/`) — the
   consolidated *refós* text.
2. **Ajuntament de Barcelona** — *Informació urbanística / recerca del planejament, qualificacions i
   convenis*.
3. **AMB** — *refós* pages, keyed by INE code. ⚠ Make sure you are on **08019 Barcelona**.
4. **BCNROC** — Barcelona's document repository.
5. **DOGC / BOPB** — for *modificacions* that amend an article.

⚠ **`08019` matters.** Municipalities layer their own *modificacions* onto shared PGM article
numbers, so **two municipalities can state DIFFERENT NUMBERS for the same article**. A figure sourced
from Badalona or Hospitalet is wrong for Barcelona even though the article number matches.

### OUTPUT FORMAT — one block per clau

```
CLAU: <code>            NAME: <official Catalan name>
────────────────────────────────────────────────────────
1. HEIGHT
   value:      <e.g. "20,75 m / PB+5" | "none stated">
   article:    PGM Art. <n>
   verbatim:   "<exact sentence in Catalan/Spanish>"
   source:     <URL + document title + date/version>
   confidence: primary-consolidated | primary-original | secondary | inferred

2. EDIFICABILITAT   … same five fields
3. OCCUPATION       … same five fields
4. SETBACKS/ALIGNMENT … same five fields
5. STREET-WIDTH DEPENDENCE … same five fields

MODIFICACIONS: <any amendment affecting the above, with its DOGC/BOPB reference — or "none found">
UNCERTAINTIES: <anything you could not resolve, and exactly what blocked you>
```

### THE RULES — these matter more than completeness

1. **VERBATIM QUOTE OR IT DOESN'T COUNT.** Every value needs the original sentence in Catalan or
   Spanish. If you cannot quote it, mark the value `NOT FOUND` and say what you tried.
2. **"NONE STATED" IS A RESULT, NOT A FAILURE.** 13a genuinely has no FAR. If the ordinance is
   silent, say so — that is information I will act on. **Never fill a gap with a plausible number.**
3. **NEVER INFER ACROSS CLAUS.** Do not carry 13a's height rule to 22a because they seem similar.
   Zones are independent.
4. **NO SECONDARY SOURCES AS FACT.** Blogs, real-estate sites, consultancy PDFs and AI recall are
   leads, never answers. If a value appears only in a secondary source, mark it `secondary` and say
   it is unverified against the ordinance.
5. **IF A RULE IS AN ALGORITHM, GIVE ME THE ALGORITHM** — the procedure, its inputs, its caps and
   floors — not a worked example. (Art. 242.2 is the model case.)
6. **DISTINGUISH "the article says X" from "X is the general rule elsewhere in the PGM."** General
   provisions (Títol IV) and zone-specific chapters interact; tell me which you are quoting.
7. **DO NOT AVERAGE, RECONCILE, OR SMOOTH conflicting sources.** Report the conflict, with both
   citations. A stated contradiction is useful; a silently resolved one is dangerous.
8. **REPORT WHAT YOU COULD NOT ACCESS.** If a viewer needs interaction you cannot perform, say which
   document and which step blocked you. That tells me exactly what a human must click.

### FINALLY

End with a short section: **"What I would NOT rely on"** — every value you produced that you would
not personally stake a professional opinion on, and why. I would rather have four solid parameters
and an honest list of eleven gaps than fifteen parameters of unknown quality.

---
