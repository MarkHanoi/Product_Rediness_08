# Brief for a Barcelona urbanista / architect — forwardable as-is

**Context in two sentences.** We are building a tool that computes what may legally be built on a
Barcelona parcel — buildable depth, height, footprint — directly from the PGM, showing the user which
article produced each number. We have clau **13a** and **13b** working end to end, and we are stuck on
three claus for want of two tables and a few sanity checks.

**Time needed: 20 minutes for the essentials, ~2 hours for everything.** Ordered by value, so
stopping early still helps enormously.

---

## ⭐ THE TWO TABLES — if you only do one thing, do this

These two are worth more than everything else on this page combined. **A photograph of the page is a
perfect answer.**

### 1 · PGM **Art. 350.c** — clau 22a (*Zona industrial*)

The article says the height and storey limit *"variaran amb l'amplada del vial al qual la parcel·la
doni, **de conformitat amb el quadre següent**"* — **we need that quadre.** Each street-width band →
maximum height (m) and storey limit (PB+N).

*(We already have from Art. 350: edificabilitat ≤ 2 m²st/m²s, occupation 90%, the 70% concentric band
above ground floor, and 5 m inside the block. Only the table is missing.)*

### 2 · PGM **Art. 340.1** — clau 20a (*edificació aïllada*)

The **subzone → net edificabilitat index** table. Every digital copy we have loses the column
alignment: we get **eleven values against ten labelled subzones**, with a stray `1,50`:

```
—   0,25   0,50   0,75   1,00   1,00   1,50   —   1,00   0,75   0,50   0,25
```

**We need to know which index belongs to which subzone** (I–V plurifamiliar 20a/6, /5, /7, /9, /9b,
/8; VI–IX unifamiliar 20a/9u, /10, /11, /12). **Please don't reconstruct it by reasoning — we need
what the page actually shows.** A mis-attributed index is worse for us than no index.

---

## THREE QUESTIONS ONLY SOMEONE WHO KNOWS THE SYSTEM CAN ANSWER

These are about **what exists**, which no document tells us, and each could save us weeks.

### 3 · Where does Barcelona publish its **own** consolidated NNUU?

Every copy we have found is another municipality's transcription — Castelldefels, Badalona, Sant
Cugat. We know municipalities layer their own *modificacions* onto shared article numbers, so the
same article states different numbers in different towns. **Is there a canonical Barcelona (08019)
consolidated text, and where does one get it?** (BCNROC? COAC? The Ajuntament? Is it purchasable?)

### 4 · Is there a published source for **street widths** (*amplada de vial*)?

We could find none, so we **measure** width geometrically by casting rays from each block frontage to
the opposite side. That works, but several PGM height tables key on width bands (8 / 11 / 15 / 20 m),
so a parcel near a boundary is decided by our measurement rather than a declared figure — and we
refuse to answer when a measurement lands within 0.5 m of a band edge. **Does the city publish
declared street widths anywhere?**

### 5 · For clau **18** parcels, is there a public register of the approved volumetries?

Clau 18 (*ordenació en volumetria específica*) is **22.5% of Barcelona's private buildable land**. We
read PGM Art. 306 as saying the buildability is *"that resulting from the established volumetric
ordering"* — i.e. the PGM points at a per-site plan rather than stating a rule, so we refuse to
compute an envelope and tell the user their parcel is governed by its own plan. **Is that reading
right? And is there a register (RPUC? NUMAMB?) from which those approved volumetries could be
obtained in bulk?** If so it would unlock nearly a quarter of the city.

---

## SANITY CHECKS ON OUR READINGS — a yes/no each

### 6 · Clau 12 vs 12b — have we got the scope right?

Art. 315.2 distinguishes subzona I (**12**), *"d'aplicació a tots els nuclis antics diferents del de
Barcelona"*, from subzona II (**12b**) for the historic centre.

**We read "el nucli antic de Barcelona" as CIUTAT VELLA specifically — not the municipality** — so
clau 12 governs the *nuclis antics* of the annexed towns (Gràcia, Sarrià, Sants, Sant Andreu, Horta)
and 12b governs Ciutat Vella. Our zoning data agrees: 26 clau-12 points spread across the city, 5 of
12b clustered on Ciutat Vella. **Is that correct?**

### 7 · Clau 12's height rule

We have one anchor — *"als solars amb una longitud de façana inferior a 6,50 metres, l'alçada màxima
permesa mai no podrà depassar la de 10,60 metres, corresponent a planta baixa i dos pisos"* — and we
know a width-based *quadre* exists just before **Art. 318**. **Which article is it, and what are its
rows?** Also: is clau 12's edificabilitat **1,40 m²st/m²s** (we have seen this attributed to Art. 316
but never confirmed)?

### 8 · Our depth construction

For clau 13a/13b we implement **Art. 242.2** as an *algorithm*, not a lookup: solve for the depth
that leaves ≥30% of the **block** (not the parcel) as interior free space, capped 30 m, floored 12 m.
So the depth differs block to block. **Is that the right reading of Art. 242.2?** We ask because every
figure circulating online ("20 m", "24 m") is a single block's answer, and we deliberately do not use
them.

*(For clau 12 we read the equivalent rule as: depth results from occupying 60% of the block at the
*alçada reguladora*. Same shape?)*

---

## ⚠ Two things that make this easier than it sounds

**A blank is a valuable answer.** Clau 13a genuinely has no FAR and no height table — we recorded
that as a finding and shipped it. **If the ordinance is silent, "none stated" is exactly what we
want.** Please don't hunt for a number that isn't there.

**Partial answers are useful immediately.** Every field in our model is independently optional, so one
real table plus honest blanks ships straight away. You do not need to complete anything.

---

## And one open question

**What are we getting wrong?** You are the first person with domain expertise to look at this. If our
whole approach contains a category error — something an urbanista would spot in thirty seconds — that
is more valuable to us than any of the tables above.
