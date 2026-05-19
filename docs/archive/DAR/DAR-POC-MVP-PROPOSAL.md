# PoC and MVP Proposal — Enterprise Cloud BIM Platform
## How to Get Something Testable in Front of DAR Engineers Fast
### Three Options by Team Size · What to Compromise · What Never to Compromise

---

## The Framing Principle: Show a Real Problem Being Solved, Not a Demo

Before any specific timeline, the most important thing to get right is what you are showing and to whom.

DAR engineers have been using Revit and Navisworks for years. They are not impressed by a 3D cube rotating in a browser. What will make them lean forward is seeing **their own data** — an IFC file from an actual DAR project — open in a browser, navigable, with at least one thing that Revit cannot do easily (real-time collaboration, AI query, or something that removes a specific pain from their daily workflow).

The goal of the PoC is not to prove the technology works. It is to prove the technology solves a real problem that real people at DAR have. Choose the pain point first. Build just enough to demonstrate relief from that pain. Everything else is backlog.

---

## The Three Stages Defined

Before proposing timelines, it is worth being precise about what these terms mean in this context, because they are often used loosely.

**PoC — Proof of Concept**
A PoC answers one question: "Is this technically possible?" It is not a product. It has no authentication, no proper error handling, no database migrations, no security hardening. It is a working spike that demonstrates a specific technical capability to a specific audience. It is thrown away (or at least heavily refactored) before production use. Duration: days to weeks.

**MVP — Minimum Viable Product**
An MVP answers a different question: "Does this solve a real problem well enough that someone would use it instead of their current tool, even in rough form?" An MVP has proper authentication, real data persistence, real error handling — but only the features needed to demonstrate the core value. It is not feature-complete. It is production-quality for the features it has. It can be handed to a pilot team and left with them. Duration: weeks to months.

**Pilot**
A Pilot is an MVP running on a real project with real stakes. A real DAR project team uses the platform for real coordination work alongside their existing tools. The founding engineer is not present for every session. Feedback comes from actual use, not supervised demos. Duration: 1–3 months of live use.

The proposal to DAR should sequence these explicitly: PoC → MVP → Pilot → Full platform. Each gate is a decision point. The PoC result decides whether to invest in an MVP. The MVP result decides whether to run a Pilot. The Pilot result decides whether to invest in the full platform.

---

## What to Compromise vs. What Never to Compromise

This is the most important list in the document. Every early-stage platform has to cut corners. The question is which corners are safe to cut and which will come back to destroy you.

### Safe to compromise in PoC/MVP

| Compromise | Why it is safe | Caveat |
|---|---|---|
| User interface polish | Engineers evaluate capability, not beauty. A functional UI that works is enough. | Must be usable — not beautiful, but not confusing |
| Feature breadth | Fewer features done well beats many features done poorly | Do not cut features that are central to the pain point you are solving |
| Performance at scale | Optimize for 10 users, not 10,000. Prove the concept, then optimize. | Must not be embarrassingly slow on a realistic file. 30s IFC load is acceptable. 5 minutes is not. |
| Mobile responsiveness | Desktop only is fine for the PoC and MVP | Do not break it on mobile — just do not actively support it |
| Advanced LOD | Simple distance culling instead of full LOD pipeline | Must handle 50k elements without crashing the browser |
| Full IFC4X3 support | Support the subset of IFC entity types DAR actually uses on their projects | Document which types are not yet supported |
| Plugin marketplace | First-party features only — no external plugins | The plugin architecture should be designed correctly even if no external plugins exist yet |
| Email notifications | In-app only is sufficient | |
| Stripe / billing | Free trial for all PoC/MVP users | Implement billing before public launch |
| GDPR/DSAR tooling | Manual process for the rare case during pilot | Must have before any external client is onboarded |
| Automated tests | Fast iteration is more valuable than test coverage in weeks 1–4 | Add regression tests for every bug found — do not skip testing entirely |

### Never compromise, even in PoC

| Never compromise | Why cutting this breaks everything |
|---|---|
| **Authentication** | Even a PoC shown to 10 engineers should require login. An unauthenticated system trains users to expect no access control. It also means no audit log, no per-user tracking, and a security incident waiting to happen. 30 minutes to add JWT auth. Always worth it. |
| **Data model correctness** | The IFC entity types used in the PoC must match the final data model. If you name things wrong in the PoC and DAR engineers learn the wrong names, you have a communication problem for years. |
| **The core pain point** | Whatever problem you chose to solve in the PoC, it must actually be solved — cleanly, reliably, without workarounds. A PoC that demonstrates the problem more clearly than it solves it is worse than no PoC. |
| **Honest feasibility** | Never demo something you cannot ship in the timeframe you have committed to. Demonstrating a PoC capability that is 3 months away from being production-ready, without saying so clearly, creates expectations that destroy trust when the timeline becomes clear. |
| **Server-side validation** | Even in a PoC, commands must be validated on the server, not just the client. A client-side-only validation in the PoC will be copied into the real system if you are not careful. |

---

## Option A — Solo Founding Engineer
### Timeline: 8 weeks to PoC · 16 weeks to MVP

This is the hardest path and the most common reality. You are alone. Every line of code is yours. Every architectural decision is made without a peer reviewer.

---

### Week 1–2: PoC — The IFC Viewer Spike

**Goal:** A specific DAR project IFC file loads and displays in a browser, with at least one element selectable and its IFC properties readable.

**What you build:**
- Express server (no auth for the PoC — just a static endpoint)
- `web-ifc` running in a Node.js worker, parsing the IFC and generating one GLB per storey
- Three.js viewer: orbit controls, ambient + directional light, click-to-select
- Property panel: when you click an element, its IFC properties (from the STEP entity) display in a sidebar

**What you do NOT build:**
- Database (serve the parsed data from memory — the worker holds it in RAM)
- Authentication
- Collaboration
- Proper error handling

**The PoC demo:**
Open a laptop in a meeting room. A DAR BIM manager is present. You open the browser, navigate to `localhost:3000` (or a Ngrok URL if remote). You drag in an IFC file from their live project portfolio. It parses (30–45 seconds for a large file — acceptable at PoC stage with a progress bar). The building appears in 3D. The BIM manager clicks a structural column. The column highlights. The right panel shows: `IfcColumn, PredefinedType: COLUMN, Material: C30/37 Concrete, CrossSection: 400x400, Level: Basement -1`.

This is the moment. If the BIM manager reaches for the mouse and starts clicking different elements, you have a PoC. If they nod politely and say "interesting," you have chosen the wrong pain point.

**Resources needed:**
- Your time (100%)
- One real IFC file from DAR (ask for it explicitly — the PoC is meaningless with a toy file)
- Ngrok account (free tier) for remote demos

**Estimated build time:** 6–10 working days

---

### Week 3–4: PoC Extension — Add the One Feature They Cannot Do in Revit

After the IFC viewer PoC, you add one feature that demonstrates genuine advantage over the status quo. Choose based on the pain you identified in your week-1 user interviews. The most universal options:

**Option A: Natural language element query (if AI pain is highest)**
- Add the LLM gateway (Anthropic API key, simple Express route, no quota metering yet)
- Textarea input: "Show me all concrete walls on Level 3 with a fire rating below 60 minutes"
- LLM returns structured JSON: `{ type: "IfcWall", level: "Level 3", filter: { material: "concrete", fireRating: { lt: "60min" } } }`
- Elements matching the query highlight in the 3D viewer
- Non-matching elements dim to 20% opacity

**Option B: Real-time collaboration (if coordination pain is highest)**
- Add Yjs + WebSocket sync server (2 days)
- Two browser windows, both showing the same IFC model
- Change an element's property in one window — it updates in the other within 200ms
- Show the coloured cursor of the second user in the first window
- This demo, run with two laptops in a room, is viscerally convincing

**Option C: Change comparison between two IFC versions (if version management pain is highest)**
- Upload two IFC files: "Last week's model" and "This week's model"
- Diff: elements added since last week highlighted in green, elements removed in red, elements moved shown with a ghost at the old position and solid at the new
- This makes visible what BIM coordinators currently do manually with Navisworks

Pick one. Build it in two weeks. Do not build all three — depth beats breadth at PoC stage.

---

### Week 5–8: Foundation (parallel with PoC feedback)

While the PoC is being shown to more stakeholders, you start the real foundation. This work is not user-facing — it is infrastructure.

- PostgreSQL schema (the real one — the data model you will use in production)
- Authentication: JWT + bcrypt, login form, session persistence
- Project CRUD: create a project, upload an IFC, store elements in the database
- CI/CD: GitHub Actions, lint, type-check, deploy to a VPS
- The CommandBus skeleton: typed command interfaces, Zod validation, OTel span setup (even without a real OTel backend yet — just console.log the spans in development)

**Week 8 milestone:** A logged-in user can create a project, upload an IFC file, have it parsed and stored in the database, and view the elements in the 3D viewer. This is not the PoC anymore — this is the beginning of the MVP.

---

### Week 9–16: MVP — The Collaborative Coordination Tool

**Goal:** A small pilot team (4–6 engineers from DAR) can use the platform for real coordination work on one project for 4 weeks without it breaking.

**What the MVP includes:**

**Must have:**
- Authentication with proper session management
- Project creation, IFC upload, element storage in PostgreSQL
- 3D viewer with element selection and property reading
- Real-time collaboration (Yjs sync) — at minimum, cursor sharing and property edit propagation
- ISO 19650 snapshot: create a named version, set state (WIP/Shared/Published)
- Element property editing via the property panel, committed through the CommandBus
- Basic undo/redo (Yjs UndoManager)
- The one PoC feature at production quality (AI query, or collaboration, or diff)

**Nice to have if time allows:**
- IFC export (not required for MVP if you have import — read-only coordination is still valuable)
- BCF comment export (useful for issue tracking integration)
- Level/storey filtering (hide/show individual floors)

**Must NOT be in the MVP (resist the pressure):**
- Full plugin SDK (design the architecture to support it, but do not build it yet)
- Mobile app (PWA is fine)
- Advanced AI features beyond the one PoC feature
- Billing
- Self-hosted deployment

**MVP success criteria:**

After 4 weeks of pilot use by 4–6 DAR engineers, at least one of them says unprompted: "I would use this instead of sending IFC files back and forth over email for this kind of coordination." That is the MVP passing.

---

## Option B — Small Team (2–3 People)
### Timeline: 3 weeks to PoC · 10 weeks to MVP

With a founding engineer and one additional engineer (ideally the 3D/rendering specialist), the PoC is both faster and more convincing.

---

### Week 1: Parallel PoC Sprint

You split the work:

**Founding engineer:**
- IFC parser running in Node.js worker (`web-ifc`)
- REST endpoint: `POST /upload` → accepts IFC file → parses → returns element list as JSON
- Simple PostgreSQL storing elements (no schema migrations yet — just get data in)

**3D engineer:**
- Three.js viewer scaffold
- GLB loader receiving geometry from the backend
- Click-to-select with raycast, selection highlight via material swap
- Camera controls: orbit, zoom, pan, first-person toggle

**End of week 1:** Both pieces join. IFC uploads, parses, elements display in 3D, click selects an element and shows its properties. This is the PoC.

---

### Week 2–3: PoC Extension — Two Features in Parallel

**Founding engineer: Collaboration spine**
- Yjs `Y.Doc` setup, sync server, WebSocket relay
- Yjs awareness: cursor positions broadcast
- Two browser windows see the same model and each other's cursors

**3D engineer: Visual quality**
- Proper PBR materials (not just grey boxes)
- Ambient occlusion for depth perception
- Discipline colour coding: architectural elements in one colour family, structural in another, MEP in another
- Level/storey visibility toggle (hide Level 2 to see Level 3 clearly)

**End of week 3 demo:** Two laptops side by side. One user moves an element — the other sees it move. One user queries the AI — the other sees the results highlight in their viewport. The building looks like a building, not a grey mesh.

---

### Week 4–10: MVP in Parallel Tracks

**Track 1 — Founding engineer: Data and backend**
- Production data model migrations
- Authentication, RBAC, project membership
- CommandBus: full implementation with validation, OTel, audit log
- ISO 19650 state machine: WIP/Shared/Published/Archived
- Event log: append-only record of every Yjs update
- AI gateway with cost metering

**Track 2 — 3D engineer: Editor and performance**
- LOD system (three tiers: 0–10m full, 10–50m simplified, 50m+ bbox)
- FrameScheduler with priority tiers (interaction, render, post-render, overlay)
- SceneCommitter: Yjs observe → Three.js diff pipeline
- Element manipulation: move, rotate, edit properties through CommandBus
- Instancing: detect repeated geometry via mesh_hash, replace with InstancedMesh
- Undo/redo (Yjs UndoManager wired through CommandBus)

**Week 6 integration checkpoint:** Merge both tracks. Run the integrated system against a real IFC file. Profile it. If frame rate is below 40fps at 30,000 elements, diagnose and fix before continuing feature work. Performance debt at week 6 is 10x harder to fix at week 10.

**MVP milestone (week 10):** 6 DAR engineers on one project. Discipline leads from architecture, structure, and MEP each have an account. The project coordinator can move a version from WIP to Shared and back. The structural lead can query "show me all beams on Level 4 with span greater than 8m" and get highlighted results. Everyone's cursor is visible to everyone else.

---

## Option C — Funded Team (5+ People from Day One)
### Timeline: 2 weeks to PoC · 6 weeks to MVP · 12 weeks to Pilot

With a funded team — founding engineer, 3D engineer, full-stack engineer, and 1–2 additional engineers — you can run three tracks simultaneously from week 1.

---

### Week 1–2: Three Parallel Streams

**Stream 1 — Backend (founding engineer + backend engineer)**
- IFC parser, PostgreSQL schema, authentication, basic project CRUD
- REST API: upload IFC, list elements, get element properties

**Stream 2 — 3D viewer (3D engineer)**
- Full Three.js viewer: orbit controls, selection, highlight, LOD day-1 skeleton
- GLB streaming from backend

**Stream 3 — Collaboration (full-stack engineer)**
- Yjs + sync server setup
- Awareness (cursors, selections)
- Simple property editing UI wired to Yjs

**End of week 2:** All three streams join. The PoC exists. Multiple users see the same model, can click elements, see each other's cursors, and edit a property with the change propagating in real time.

**The PoC demo at week 2:** This is a substantial demo. Three laptops. Three people from DAR (ideally a structural lead, an MEP lead, and a BIM coordinator — three different stakeholder types). Each person can navigate the model, select elements from their own discipline, and see the others' cursor positions and selections. One person edits a fire rating — the others see it update. The BIM coordinator runs an AI query — results highlight for all three.

This is the demo that gets the project funded and the team expanded.

---

### Week 3–6: MVP — Production Quality for the Core

**Stream 1: Data integrity and compliance**
- CommandBus: full implementation (validation, optimistic apply, rollback, OTel spans, audit log)
- ISO 19650 state machine: all transitions, role gating, append-only audit log
- Event log: every Yjs update persisted in order
- Snapshot creation on state transitions
- RBAC: project-level roles enforced on every API call

**Stream 2: Editor — interaction quality**
- FrameScheduler with all priority tiers
- SceneCommitter: full Yjs observe → Three.js diff pipeline
- Full LOD pipeline (not just a skeleton — all three tiers, cross-fading)
- Geometry instancing (InstancedMesh for repeated elements)
- Element manipulation: move via CommandBus, property edit via panel
- Undo/redo wired through CommandBus

**Stream 3: User interface**
- Project dashboard: list of projects, create project, IFC upload with progress
- Collaboration presence panel: who is online, their colour, their active tool
- Version history panel: named snapshots, state badges, publish action (role-gated)
- Property panel: real-time editing, validation feedback, undo button
- AI query interface: natural language input, highlighted results in 3D, result count

**Stream 4 (if 5th engineer available): IFC export**
- `web-ifc` write API wired to the element graph
- `GET /api/v1/projects/{id}/versions/{vid}/export?format=ifc` → presigned download URL
- Round-trip test: IFC in → modify 10 properties → IFC out → open in Revit → confirm properties correct

**Week 6 MVP milestone:** The platform is handed to a pilot group of 8–10 DAR engineers across two disciplines (architecture + structure). They are given one real project. For 4 weeks, they use the platform for coordination — without the founding engineer present. Support is available via a chat channel. You observe passively.

---

### Week 7–12: Pilot — Learning from Real Use

**Do not build new features during the pilot.** This is the most common mistake. The instinct is to respond to every pilot user request by shipping the feature immediately. Resist this.

During the pilot, your job is:
1. Keep the system running (fix bugs, do not ship features)
2. Watch users through session recordings (Hotjar or similar — with consent)
3. Run structured interviews at week 2, week 4, and week 6 of the pilot
4. Count and categorise every support request (what are they confused by? what do they try to do that fails?)

The pilot produces a prioritised feature list for the next 6 months — based on actual evidence, not assumptions. This is the input to the full product roadmap.

---

## Summary Table: What to Show at Each Gate

| Gate | Audience | What they see | Decision they make |
|---|---|---|---|
| **PoC** (2–3 weeks) | Technical leads, BIM managers | IFC viewer + one compelling feature (real project data) | "Is this worth investing in?" |
| **MVP** (6–16 weeks depending on team) | Project engineers (pilot group) | Collaborative editor, AI query, version management, ISO 19650 states | "Is this good enough to run a pilot?" |
| **Pilot** (4–6 weeks of real use) | Discipline leads, project directors | Unattended use on a real project | "Do we want to expand this to more teams / invest in the full platform?" |
| **Full platform** (month 12+) | All of DAR / external clients | Complete authoring, full plugin ecosystem, self-hosted option | "Do we license this externally?" |

---

## The Proposal Structure

When presenting this to DAR leadership, the proposal should follow this structure:

### Slide 1: The Pain (1 slide)

Show the cost of the status quo. Not in words — in numbers.

"A 200-person project team loses approximately 520 person-days per year to BIM coordination overhead — scheduling sync sessions, manual clash reviews, IFC file distribution, version confusion. At [DAR's senior engineer cost]/day, that is £[X] per project per year. This is the problem we are solving."

Get this number from your week-1 interviews. A real number from a real project is 10x more powerful than a hypothetical.

### Slide 2: The Proposal (1 slide)

Three phases, three decisions, three investments.

"We propose a 3-phase programme. Phase 1 (2–3 weeks, £X): a Proof of Concept answering 'is this technically feasible with real DAR project data?' Phase 2 (10–16 weeks, £X): an MVP answering 'does this solve the coordination problem well enough for a pilot team?' Phase 3 (4–6 weeks, £X): a Pilot answering 'should we invest in the full platform?' Each phase is a decision point. You can stop at any gate."

### Slide 3: What the PoC Shows (1 slide)

Be specific. "In 2 weeks, using an IFC file from [specific DAR project], we will demonstrate: [list exactly what the demo shows]. The PoC does not include [list exactly what is not included]. This is intentional — we are proving one thing."

### Slide 4: What "Success" Means at Each Stage (1 slide)

Define success criteria before you start. Undefined success criteria lead to debates at the end about whether something "worked."

"PoC success: the system opens a real DAR IFC file and demonstrates [specific capability] without crashing. MVP success: at least 4 of 8 pilot engineers say unprompted that they would use this for coordination on their next project. Pilot success: coordination meeting frequency on the pilot project decreases by at least 25% over the pilot period (measurable — count the meeting invitations)."

### Slide 5: The Team Required (1 slide)

Be direct about what you need to execute. Do not understate it — underpromising resources and then asking for more halfway through is a trust-destroying move.

"Option A (solo, 16 weeks to MVP): [me], with BIM domain expertise available for consultation from [senior BIM coordinator]. Risk: single point of failure, longer timeline. Option B (2–3 people, 10 weeks to MVP): [me] + [3D engineer hire or contract] + [full-stack engineer hire or contract]. Risk: hiring timeline. Option C (5 people, 6 weeks to MVP): [me] + 4 specialist hires. Fastest path to pilot, highest initial investment."

### The one thing to say in the room

If you have one sentence to leave them with: "Give me 2 weeks and a real IFC file from your most painful coordination project, and I will show you something your engineers will want to use. That is the first decision point. We do not spend another pound until you see that."

This is the right offer because it is low risk (2 weeks, minimal cost), high information (real data, real demo), and it moves the conversation from "should we invest in this?" to "when do we start?"

---

## Risks and How to Communicate Them Honestly

Do not hide risks in a proposal. Stakeholders who discover undisclosed risks later feel deceived. Stakeholders who are told risks upfront and see them managed feel trust.

| Risk | Likelihood | Communication |
|---|---|---|
| Real IFC files from DAR projects contain schema violations or non-standard exports | High | "We expect this. We will discover which Revit export settings produce clean IFC and document them as a prerequisite for import." |
| The 3D viewer is slow on older hardware that some engineers use | Medium | "The MVP targets modern browsers on hardware newer than 3 years. We will test on your specific hardware configurations before the pilot." |
| Engineers resist changing workflows even if the tool is good | High | "The MVP does not replace existing tools — it runs alongside them. IFC import means they keep using Revit for authoring and use this platform for coordination. Adoption risk is lower when you are adding, not replacing." |
| The AI query returns incorrect results for some queries | Medium | "All AI results are advisory — highlighted elements are for the engineer to review, not automatically acted upon. The engineer is always in control. We will document the query types where the AI performs well and where it is unreliable." |
| The sync server becomes a single point of failure for collaboration | Low (PoC/MVP) | "For the pilot (8–10 users), a single sync server instance is sufficient. We will design for horizontal scaling from day one, so scaling out requires configuration, not code changes." |

---

*Document prepared for DAR / Sidara Founding Platform Engineer interview — PoC and MVP proposal structure with options by team size.*
