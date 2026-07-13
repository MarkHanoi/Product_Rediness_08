# SnT · CVI² — Full Stack Engineer, AI & 3D Applications
## Interview dossier (prepared 2026-07-13)

**Role:** Full Stack Software Engineer — AI & 3D Applications, CVI² research group (Prof. Djamila Aouada), SnT, University of Luxembourg. 12-month fixed term, Kirchberg campus.
**Format:** experience discussion + technical discussion on **the MORFIS project** + a **collaborative coding session**.
**Panel:** Sean Blevins, Ahmet Karadeniz, Anis Kacem, Dimitrios, Olivier.

---

## The one-sentence thesis

> **They are building an AI that writes CAD. You have spent a year building an AI that writes buildings.**
> MORFIS turns language + images into executable, parametric CAD. PRYZM turns language into parametric BIM
> geometry, rendered in Three.js/WebGPU and exported to IFC. Same problem — *making generated geometry
> actually valid* — different vertical.

Everything in this dossier serves that thesis.

---

## Read in this order

| # | Document | Why |
|---|---|---|
| **01** | [MORFIS decoded](./01-MORFIS-DECODED.md) | What their project actually is, the research context, and the questions that prove you understand it. **Read first.** |
| **02** | [Evidence map: PRYZM → the job spec](./02-EVIDENCE-MAP.md) | Every JD requirement mapped to real code, with file paths. Your proof. |
| **03** | [Three.js / WebGL playbook](./03-THREEJS-WEBGL-PLAYBOOK.md) | The rendering-optimisation answers, with your measured numbers. |
| **04** | [LLM orchestration & context engineering](./04-LLM-ORCHESTRATION.md) | Your architecture, honestly stated — plus the LangChain vocabulary you lack. |
| **05** | [Geometry & CAD kernels](./05-GEOMETRY-CAD-KERNELS.md) | manifold-3d, B-rep vs mesh, the seam story. Their "nice to have", which you have. |
| **06** | [The Python / FastAPI / CadQuery gap](./06-PYTHON-FASTAPI-CADQUERY.md) | Your real weakness. Close it enough to be credible, and be honest about the rest. |
| **07** | [Coding-session drills](./07-CODING-DRILLS.md) | What to be able to type from memory. |
| **08** | [Stories & questions](./08-STORIES-AND-QUESTIONS.md) | STAR-format war stories; what to ask them. |
| **09** | [**Deep Q&A on your work**](./09-DEEP-QA-ON-YOUR-WORK.md) | **Every question they can ask about PRYZM, and the answer.** Most of the hour will be this. |
| **10** | [**System design: build MORFIS**](./10-SYSTEM-DESIGN-BUILD-MORFIS.md) | **The most likely whiteboard question.** Where you can outclass every other candidate. |
| **11** | [Fundamentals drill](./11-FUNDAMENTALS-DRILL.md) | Graphics math, WebGPU, geometry, LLM internals. They test the foundations, not the API. |

Companion one-pager (skimmable during the call): the published cheat sheet artifact.

---

## If you only have one hour

1. **20 min** — [01-MORFIS-DECODED](./01-MORFIS-DECODED.md). You cannot fake knowing their project.
2. **15 min** — [06-PYTHON-FASTAPI-CADQUERY](./06-PYTHON-FASTAPI-CADQUERY.md). Write one 20-line FastAPI app so you can say *"I've written FastAPI"* truthfully.
3. **15 min** — [03-THREEJS-WEBGL-PLAYBOOK](./03-THREEJS-WEBGL-PLAYBOOK.md), memorising **three numbers**.
4. **10 min** — [08-STORIES-AND-QUESTIONS](./08-STORIES-AND-QUESTIONS.md), rehearsing the two bug stories out loud.

---

## The three rules for this interview

**1. Lead with the analogy, not the résumé.**
Don't recite PRYZM's feature list. Say: *"Your problem is turning language into valid parametric geometry. That's the problem I've been living in — here's what I learned about where the model should stop."* You are the only candidate who has already shipped this.

**2. Volunteer your gaps before they excavate them.**
You have **zero Python** and **zero LangChain**. They will find out. A candidate who says *"here's what I don't have, here's the nearest thing I do have, here's how fast I close it"* reads as senior. A candidate caught bluffing reads as a risk. Both gaps have prepared scripts in this dossier.

**3. Never overclaim. Three specific traps:**
- ❌ "We use OpenCASCADE." → It is a **reserved swap path** in an ADR. No OCC dependency exists.
- ❌ "The LLM output is Zod-validated." → It is **JSONRepair + hand-rolled validators**. Zod is used elsewhere.
- ❌ "I've done tool-calling / RAG / streaming." → **None of it.** Prompt contract + JSON repair. Say so, then say what you'd do instead.

Getting caught on any of these costs more than the claim was worth. Precision *is* the differentiator with a research group.

---

## Logistics

- **Monday 13 July, 15:00 Luxembourg** (14:00 your local). Microsoft Teams.
- Bring: GitHub/portfolio ready to screen-share. Have PRYZM **running** (`pryzm.fly.dev`) — a live 3D BIM app you built is a stronger artefact than any slide.
- If they ask for a demo: show **generate → 3D → plan → IFC**, then open the console and show the deterministic layout engine logging its stages. That is the whole pitch in 90 seconds.
