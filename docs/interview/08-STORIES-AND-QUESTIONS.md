# 08 — Stories & questions

Interviews are won on **two or three stories told well**, and on **the questions you ask**.

---

## Story 1 — "Tell me about a hard bug" ⭐ *use this one*

**The plan-view cut. Told in five beats:**

> **Symptom.** *"The founder kept reporting that a door didn't interrupt the wall in a plan drawing. The wall line ran straight through the doorway. He'd raised it repeatedly."*
>
> **The obvious hypothesis — and it was wrong.** *"There was a function whose entire job was to clip wall lines at door openings. Everyone assumed it was failing to fire. I wrote up four hypotheses about why it wasn't running."*
>
> **The measurement.** *"All four were wrong, and so was the question. The clipping code was fine. The real problem was upstream: the 'cut' layer of the drawing was **always empty, for every wall, in every plan view**. It was populated by tagging edges within 15 cm of the cut plane — and a wall has no edge anywhere near a 1.2 m cut plane. Its edges are at the floor and at the head. So no wall ever contributed a single line to it."*
>
> **The fix.** *"Instead of clipping lines, I actually **section the solid** — intersect the wall's triangles with the horizontal cut plane. Now the door void is empty **by construction**: at that height, the wall genuinely isn't there. It can't be drawn through, on any render path."*
>
> **The guard.** *"And I turned the root cause into a test: the suite now asserts that the old classifier returns nothing for a wall, so the bug can't silently come back."*

**Why it's a great story:** it's a *drawing* problem solved with *geometry*; the elegant fix is the one that makes the bug **impossible** rather than **handled**; and it ends with a regression guard. It also demonstrates the trait they most need in an AI-geometry pipeline: **distrusting your own root cause until you've measured it.**

---

## Story 2 — "Something that surprised you"

**The exploding building.**

> *"A regression test for the level-explode view started failing with a value of **-8.36 × 10¹¹⁹** where it expected **8**. That's not drift, that's a transform being re-applied.*
>
> *The cause was two clocks. The animation seeded its time baseline from the ambient `performance.now()`, but each tick was handed a timestamp by an injected frame scheduler. Nothing guaranteed they shared an origin. A negative `dt` flipped the easing factor from a fraction into a large negative number — and the exponential approach became an exponential **divergence**. Every frame overshot further.*
>
> *One clock, and a clamp so time can never run backwards. But the part I liked: the test only ever passed because the suite used to boot in under a second. As the codebase grew, the real clock outran the fake one and the test tipped — with **no product change at all.**"*

**Why:** shows numerical intuition, shows you understand time in animation, and it's genuinely funny.

---

## Story 3 — "A bug that was hiding a real defect" *(use if they probe on testing/rigour)*

> *"I was cleaning up a suite of failing tests. One looked like classic test rot — a climate test asserting live weather data, getting the offline fallback instead. Easy to 'fix' by changing the assertion.*
>
> *I triaged it product-first instead, and it was telling the truth: the live data **could never load**. The system is offline-first — it seeds a bundled default, then upgrades to live measurements in the background. But the cache was keyed only by location, so the bundled result was returned to the upgrade path as a cache hit, and **the live fetch was never even attempted**. Not 'it failed' — never made. Every site in production had been pinned to fallback data for the life of that code path.*
>
> *The fix was making the cache tier-aware: a fallback may satisfy a caller that can't do better, but it must never short-circuit a caller that can fetch live.*
>
> *The lesson I took: when a test is red, the first question is 'is the test wrong, or is the product wrong?' — and the comfortable answer is usually the wrong one."*

**Why:** every research group has a graveyard of "flaky tests" that were reporting real bugs. This is a maturity signal.

---

## Story 4 — "Tell us about PRYZM" (the 90-second version)

> *"It's a browser-based BIM platform — you design a building in 3D, it generates the plans and sections, and it exports IFC. It's a pnpm monorepo, TypeScript throughout, Three.js with a WebGPU renderer, and a geometry kernel doing extrusions and booleans.*
>
> *The part relevant to you is the AI layer: you describe a brief in natural language and it generates a laid-out, furnished, parametric building. And the architectural decision I'd defend is that **the model never touches the geometry.** It proposes intent; a deterministic engine computes the layout — a bubble graph, space-syntax analysis, rectangular decomposition, and a Pareto front over candidates. Around forty domain rules are validators in code, not sentences in a prompt. If validation fails, the failures go back into the next prompt as the feedback signal.*
>
> *The result is that the whole product still works with the model switched off — which sounds like a limitation, but it's what forced the good architecture."*

**Then stop talking.** Let them ask.

---

## Weaknesses — pre-scripted, not improvised

| If asked… | Answer |
|---|---|
| **"What's your weakest area for this role?"** | *"Python. My backend work is TypeScript. Given your kernel is CadQuery, that's the thing I'd close first, and I'd rather say so now than have it surface later. The REST and async concepts port directly; it's syntax and idiom I'd be picking up."* |
| **"You haven't used LangChain."** | *"No. I built the orchestration myself — registry, cost meter, mockable relay, validation-driven retry, approval queue. In my domain the hard part was the contract between the model and a geometry kernel, and a generic framework doesn't give you that. I know what LangChain abstracts and I'd use it where it earns its keep."* |
| **"Have you worked with research teams?"** | *Be honest.* Then: *"What I do have is the translation skill this role is really about — turning a research idea into something that survives contact with a real user. That's what PRYZM is: an architecture that keeps working when the clever part fails."* |
| **"Why leave your own product?"** | *Do not badmouth it.* *"I've built a lot of this alone. I want to work alongside people who are better than me at the parts I've had to teach myself — and this is the exact intersection I've been living in, with actual researchers in it."* |

---

## What to ask them — pick four

**Technical (these prove you understood MORFIS):**
1. *"Is your intermediate representation free-form Python, or a constrained op schema you compile to CadQuery? That choice decides how much you can validate before execution rather than after."*
2. *"How do you validate the generated solid — geometric checks, or is a kernel exception the signal? And is the vision model in a self-correction loop over a rendered view?"*
3. *"Selectors like `.faces('>Z')` seem like the hardest thing for a model — it has to reason about geometry it built but can't see. Is that where you see failures cluster?"*
4. *"On the front end: are you shipping tessellated meshes, or keeping a parametric representation client-side so edits don't round-trip?"*
5. *"What does 'manufacturable' mean in your validation — wall thickness, overhangs, printability?"*

**About the work:**
6. *"How much of this is research versus product? Is there a real user on the other end, or is the target a paper and a demo?"*
7. *"Where does the engineering stop and the research start — would I be implementing the researchers' designs, or shaping them?"*
8. *"You mention industrial partners. Who's using this, and what do they need that it can't do yet?"*

**About the role:**
9. *"It's a 12-month contract — what does success look like at month 12, and is there a path to extension?"*
10. *"Am I the only full-stack engineer, or is there a team? Who owns the front end today?"*

---

## The closing line

If they ask *"anything else you want us to know?"*:

> *"Only that this is the first job posting I've read where I've already built the thing — just in a different vertical. You're turning language into valid parametric geometry; I've spent a year doing that for buildings. And the lesson I'd bring on day one is the one that cost me the most to learn: **let the model own intent, and let a deterministic engine own the geometry** — because that's the only version of this that you can actually test."*

---

## Practicalities

- **Have PRYZM running** at `pryzm.fly.dev`. A live 3D BIM app beats any slide.
- If you demo: **generate → 3D → plan → IFC**, then open the console to show the deterministic engine logging its stages. 90 seconds.
- Test Teams audio beforehand. Editor font size up. Water.
- **You are interviewing them too.** A 12-month contract is a two-way decision.

**Good luck. You are more prepared for this specific role than you realise.**
