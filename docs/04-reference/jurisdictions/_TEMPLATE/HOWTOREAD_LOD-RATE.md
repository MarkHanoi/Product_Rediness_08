# How to read the LOD-Rate — in plain words

*This explains what the `LOD 2 · ~95%` in every `LOD-RATE.md` actually means. No jargon.
Read once. It is a DIFFERENT number from the one in `HOWTOREAD_RATE.md` — see the last
section for how the two differ, because mixing them up is the one mistake to avoid.*

---

## The one-sentence version

**The LOD-rate is: when a user drops a pin, how faithfully can PRYZM rebuild the REAL
buildings already standing around that plot — with their true heights and roofs — instead
of drawing flat grey boxes at a guessed height.**

A higher LOD-rate = the surrounding city renders as a true 3D model (right heights, real
roofs), so a massing study, its shadows, and its views are trustworthy. A lower LOD-rate =
we can draw the footprints but have to *guess* how tall each building is, so the context is
a flat cartoon.

---

## The picture in your head

You drop a pin to study a new building. PRYZM shows you the plot **and the neighbourhood
around it** in 3D. For that neighbourhood to be useful (shadows, views, "does my tower
overshadow the school?"), PRYZM needs three things about every existing building nearby:

- **(a) its parcel** — the outline of the plot it sits on,
- **(b) its real height** — how tall it *actually* is, measured, not guessed,
- **(c) extra detail** — its roof shape, how many floors, what it's used for, its age.

The whole game is **(b), the real height.** Here's why:

| What we have | What the neighbourhood looks like | The name |
|---|---|---|
| Just the footprint, no real height | flat outlines, or grey boxes all at a **fabricated 9 m** | **LOD 100** |
| Footprint **+ real measured height** | correct-height boxes — right skyline | **LOD 150 (LoD1)** |
| Footprint + real height **+ real roof shape** | true massing with pitched/hipped roofs | **LOD 200 (LoD2)** |

Footprints are *everywhere* (OpenStreetMap has most of the planet). **Real heights are the
rare part.** So the LOD-rate is really a measure of: *does this country publish the real
height of its buildings, or must we guess?*

---

## Why the numbers differ between countries

It is **not** about how nice the buildings are. It is purely **whether the country built a
national 3D model of its buildings, or left us with footprints only.**

- 🇳🇱 **Netherlands — LOD 2.2, ~97%.** The Dutch published **3DBAG**: every building in the
  country with its real roof shape, measured from national laser-scanning. Drop a pin, get a
  true 3D neighbourhood. **This is the ceiling — proof that near-perfect is possible.**
- 🇨🇭 **Switzerland — LOD 2, ~95%** and 🇩🇰 **Denmark — LOD 2, ~93%.** Same story: a national
  3D building model with real roofs, plus a register that tells you each building's floors,
  age and use.
- 🇫🇷 **France — LOD 1→2, ~80%.** France publishes the real *height* of every building (the
  `HAUTEUR` field in BD TOPO) but not yet the roof shape — so we get correct-height boxes now,
  real roofs once the national laser-scan finishes.
- 🇸🇦 **Saudi Arabia — LOD 1, ~18%.** No open national building model, and the government
  parcel service is blocked from outside the country. All we can reach is AI-detected
  footprints with a coarse guessed height. **This is the honest floor.**

So the LOD-rate is a **measure of the country's open 3D data, not of PRYZM's cleverness.**
Where a country gives us real heights, we render truth; where it doesn't, we say so.

---

## The binding number: real-height coverage

Every `LOD-RATE.md` shows three sub-metrics, but **watch the middle one — real building
height.** Parcels and footprints are easy and near-universal. Real height is the metric that
decides whether the picture is honest.

> The founder's test: **"How can we have the rules if we don't even have the heights of the
> buildings?"** — the LOD-rate is the answer to the second half of that question.

---

## VERIFIED vs ESTIMATED — trust the tag

- **VERIFIED** = we actually called the endpoint this pass and saw the data (e.g. we pulled a
  Paris building and read `hauteur: 21`). Trust it.
- **ESTIMATED** = a desk read of the source's own spec — likely right, but not proven live yet.

We never dress a desk guess up as a measurement. That is the one rule these docs exist to keep.

---

## The trap: this is NOT the buildable-rule rate

There are **two rates** and they measure opposite things:

| | `RATE.md` (the rules rate) | `LOD-RATE.md` (this one) |
|---|---|---|
| Asks | "What MAY I build here?" (zoning) | "What IS already built here?" (physical) |
| About | future — the legal envelope | present — the existing neighbourhood |
| High when | the country digitised its planning numbers | the country digitised its 3D buildings |

They are **independent.** France is **~22% on rules** (planning numbers are locked in PDFs)
but **~80% on context** (real building heights are a free national dataset). Saudi is the
mirror image: decent on rules, near-zero on context. **Never add them together, never quote
one for the other.** A place can be brilliant at one and hopeless at the other.

---

## How to read any LOD-RATE.md line

> **"France — LOD 1→2, ~80%"** → *"For ~80% of buildings around a French plot we can get the
> real measured height today (correct-height massing), and the real roof shapes are coming as
> the national laser-scan finishes. It's a strong physical model — even though France's
> buildable RULES are mostly still in PDFs (that's the other rate)."*

And **"NOT YET ASSESSED"** means exactly that — we haven't measured this place's 3D data yet.
It is *not* 0%; it's "unknown, and we won't guess."
