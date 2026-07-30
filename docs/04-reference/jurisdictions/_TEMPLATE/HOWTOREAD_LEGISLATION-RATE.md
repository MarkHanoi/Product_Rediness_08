# How to read the Legislation Rate — in plain words

*This explains what the `%` in every `LEGISLATION-RATE.md` actually means (the legislation/data-fill
rate that feeds the LEGISLATION axis of the composite master `RATE.md`). No jargon. Read once.*

---

## The one-sentence version

**The rate is: out of 100 plots a user drops a pin on, how many can PRYZM answer
*"here's what you can build"* — instantly, by itself, without a human having to open a
legal PDF and read it.**

That's it. A higher rate = more plots we answer automatically. A lower rate = more plots
where a person still has to go read the local planning law by hand.

---

## The picture in your head

Imagine a user drops a pin on a plot and asks PRYZM: **"What can I build here?"**

To answer, PRYZM needs a few facts about that exact plot:
- the **zone** it's in (residential? commercial?),
- **how much** you can build (a density number — floor-area ratio, or coverage %),
- **how tall** you can go (height / floors),
- the **setbacks** (how far from the edges you must stay).

Now — **where do those numbers live?** Two very different worlds:

| World | What it looks like | Can PRYZM read it automatically? |
|---|---|---|
| 🟢 **The numbers are DATA** | The government publishes them in a database/map you can query: "plot X → height 18 m, coverage 60%." | **Yes** — instant answer. |
| 🔴 **The numbers are in a PDF** | The numbers exist, but only inside a 300-page planning-law PDF written for lawyers. | **No** — a human has to open the PDF, find the article, and type the number in. |

**The rate is simply: what % of plots fall in the 🟢 green world.**

---

## Why the numbers are so different between countries

It's **not** that some countries have better buildings or better rules. It's purely
**whether that country digitised its planning numbers into data, or left them in PDFs.**

- 🇩🇰 **Denmark ~96%** — Denmark put almost everything into one national database
  (Plandata). Drop a pin, get the numbers. Almost nothing needs a PDF. **This is the
  ceiling — proof that ~96% is possible when a country digitises its rules.**
- 🇫🇷 **France ~22%** — France has great maps for *where* the zones are, but the actual
  build numbers are still written in local PDF regulations. So most plots need a human.
- 🇪🇸 **Barcelona ~48%** — about half-and-half: some is queryable data, the rest is
  constructed from geometry + PDF articles. **This is our pilot** — the city we're proving
  the climb on.

So the rate is really a **measure of the country's data, not of PRYZM's cleverness.**
Our job is to climb as high as that country's data (plus honest effort) allows.

---

## What the rate is NOT — so you don't misread it

- ❌ **It is NOT how accurate our rules are.** A number we *do* answer is still cited and
  checked. The rate is about *how many* we can answer automatically, not whether they're right.
- ❌ **It is NOT how much of the map we cover.** It's per-plot answerability, not square
  kilometres.
- ❌ **It is NOT a quality score for the city.** A beautiful city can score low just because
  its rules are in PDFs.
- ❌ **It is NOT a promise.** If we can't answer a plot honestly, we *say so* ("this needs
  the local plan") rather than inventing a number. A low rate is honest, not broken.

---

## How to read any LEGISLATION-RATE.md number

> **"Barcelona ~48%"** → *"For roughly half the plots in Barcelona, PRYZM can tell you what
> you can build on its own. For the other half, the numbers are locked in planning PDFs, so
> today that still needs a person — and that gap is the to-do list in
> `RATE-IMPLEMENTATION-PLAN.md`."*

And **"NOT YET ASSESSED"** means exactly that: **we haven't measured this place yet.** It is
*not* 0% — it's "unknown, and we won't guess." (Guessing a number we haven't measured is the
one thing these docs are built to never do.)

---

## Where it goes next

Each place has a partner file, **`RATE-IMPLEMENTATION-PLAN.md`** — the step-by-step to-do
list to climb the rate as high as that country's data allows (using Denmark as the "what
maximum looks like" and Barcelona as the "how we climb" examples). The rate tells you *where
you are*; the plan tells you *how to get higher*.
