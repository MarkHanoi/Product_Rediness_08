# The Founding Engineer Role and Team Structure
## A Detailed Guide for the DAR / Sidara Enterprise BIM Platform

---

## Section 1 — What a Founding Platform Engineer Actually Is

The title "Founding Platform Engineer" contains three distinct words that each carry weight.

**Founding** means you arrive before the product exists. There is no codebase to inherit, no architecture to extend, no senior engineer to ask for context. Every decision you make — from the database schema to the deployment pipeline to the team culture — is yours. This is not a promotion from "senior engineer." It is a fundamentally different mode of working. Most engineers who have spent their careers in established codebases find this either exhilarating or paralysing, and it is important to know which one you are before accepting the role.

**Platform** means you are not building features for end users. You are building the infrastructure, the contracts, the extension points, and the guardrails that other engineers (including future teammates, discipline-specific developers, and external plugin authors) will build on top of. A product engineer asks "does this solve the user's problem?" A platform engineer asks "does this enable others to solve the user's problem safely, consistently, and at scale?" These are profoundly different questions, and optimising for the wrong one causes either an unmaintainable monolith or a beautiful platform that ships no product.

**Engineer** means you do the work. In the first 12 months, you are not an architect who sketches on whiteboards and hands designs to others. You write the first 50,000 lines of production code. You debug the IFC parser at 11 PM. You are on call when the sync server crashes at 3 AM during a client demo. The credibility you build by knowing the codebase at every level is what lets you lead the team that will eventually outnumber you.

---

## Section 2 — The Founding Engineer's Decisions vs. The Founding Engineer's Tasks

Before going month by month, it is worth separating **decisions** (things that are extremely hard to change later) from **tasks** (things that can be done incrementally or redone if wrong).

### Decisions — must get right from the start

These decisions, once embedded in a running system with real data against them, are expensive to undo. They deserve disproportionate time and careful thought.

**1. The element data model.** How a wall, a column, a slab, a door is represented in the database. What fields are required. How properties are stored (typed columns vs. JSONB). How relationships between elements are modelled. Once thousands of projects exist against a schema, migrating it requires touching every record. This decision deserves a month of investigation, documentation, and review — before a single feature is built.

**2. The tenant isolation model.** How projects belonging to different clients (if DAR eventually licenses to other firms) or different internal divisions are separated in the database. This is a decision between row-level security (all clients in one database, filtered by `org_id`), schema-per-tenant (each client gets their own PostgreSQL schema), and database-per-tenant (complete isolation, highest operational cost). Changing this after data exists is a major infrastructure project. Choosing correctly at the start is free.

**3. The command bus contract.** What a command looks like — its shape, its validation rules, its relationship to the undo stack, its audit log representation. The command bus is the central nervous system of the platform. If its contract is weak (commands are freeform JSON blobs rather than typed interfaces), every consumer of it becomes fragile. If its contract is strong (every command type has a Zod schema, a typed payload, and a registered handler), the platform stays consistent as it grows.

**4. The plugin boundary.** What information plugins can access, what operations they can perform, and what they are completely blocked from. If you design the plugin boundary too permissively, a malicious or buggy plugin can corrupt the model or exfiltrate client data. If you design it too restrictively, no useful plugin can be built. This boundary must be designed before the first plugin is written — not retrofitted after.

**5. The API versioning strategy.** How you will evolve the API without breaking existing integrations. Once your Revit add-in (or any external system) is calling your API, you cannot change the response format without coordinating a simultaneous update to every consumer. This is not a theoretical concern — it affects what you deploy in month 2.

### Tasks — can be done incrementally

- CI/CD pipeline setup (start simple, improve continuously)
- Observability instrumentation (add as you go, guided by incidents)
- Test coverage (add tests for regressions as they occur)
- Performance optimisation (measure first, optimise after)
- Feature development (always iterative)
- Documentation (living document, never finished)

---

## Section 3 — Month-by-Month: What Success Looks Like

### Months 1–3: The Foundation

**What you are doing:**

The first three months produce almost no user-visible features. This is correct and expected. You are building the infrastructure that every future feature depends on.

**Week 1–2:** Orient yourself completely before touching code.
- Read every IFC 4X3 entity you will encounter (IfcWall, IfcSlab, IfcColumn, IfcBeam, IfcDoor, IfcWindow, IfcBuildingStorey, IfcSite, IfcProject). Understand their geometric representations and their property sets.
- Read the ISO 19650 standard. Understand what WIP, Shared, Published, and Archived mean in a legal/contractual context — not just as enum values.
- Interview 5 engineers from different disciplines at DAR. Ask them: "Walk me through your workflow on a typical coordination day." Record everything. Their workflow is the product you are building.
- Audit any existing digital infrastructure: what CDEs are in use? What Revit versions? What naming conventions are enforced? What are the current pain points? The founding engineer who builds without this knowledge builds for an imagined user, not the actual one.

**Week 3–4:** Design the data model on paper. Not in code.
- Sketch the `Element`, `GeometryRecord`, `Relationship`, `SpatialLevel`, and `ProjectSnapshot` schemas. Write down every field, its type, and — critically — *why* that decision was made. This reasoning document is more valuable than the schema itself, because when someone asks "why is `properties` a JSONB column and not a separate table?" in 2027, you can answer with evidence rather than "I think it was for flexibility."
- Show this schema to a senior structural engineer and a BIM coordinator. Ask them: "If you needed to find all walls with a fire rating below 60 minutes that intersect this grid line, could this schema answer that question?" If they cannot see how, revise.
- Design the ISO 19650 state machine transitions and the role-permission matrix. Get these reviewed by someone who understands the contractual implications, not just the technical ones.

**Week 5–8:** Build the backend skeleton.
- Express.js server with the versioned route structure (`/api/v1/`, `/v1/ai/`, `/api/stripe/webhook`)
- Authentication (JWT + bcrypt, OAuth integration with Google/Microsoft)
- PostgreSQL connection with migrations
- The RBAC middleware: resolve role from database on every authenticated request
- The ISO 19650 state machine: implement the version state transitions with all constraints
- The audit log: every state transition writes an immutable row
- CI/CD: lint, type-check, run tests on every commit; deploy to staging automatically

**Week 9–12:** The IFC import pipeline — end to end.
- `web-ifc` running in a Node.js worker thread (not the main process — never block the API server)
- Parse a real IFC file from a real DAR project (get one, however large)
- Extract elements, properties, spatial hierarchy, and geometry
- Write elements to the database
- Generate per-element GLB fragments and store in object storage
- Expose an API endpoint: `POST /api/v1/projects/{id}/import`
- Stream progress events via WebSocket: "Parsing... 23%... 67%... complete"

**What "done" looks like at the end of Month 3:**

A real IFC file from a real DAR project — not a toy example, not a sample file, but an actual project file from the library — uploads, parses, and displays as a navigable 3D model in a browser, with the correct elements, properties, and spatial hierarchy. The state machine is running. The audit log is being written. Authentication works. The CI/CD pipeline is green.

No collaboration yet. No AI yet. No plugins yet. Just a working, tested, deployable foundation.

**The metric:** Can you hand a laptop to a DAR structural engineer who has never seen the platform and have them upload an IFC, navigate the 3D model, and read element properties without any explanation? If yes, month 3 is done.

---

### Months 4–6: Collaboration and AI Baseline

**What you are doing:**

The platform becomes collaborative. Two engineers in different offices can work on the same model simultaneously. The AI gateway is operational with at least one high-value feature shipping.

**Month 4: Yjs CRDT integration.**
- Integrate the sync server (`apps/sync-server`) with the backend
- `YjsDocAdapter` converting between the typed element store and Yjs `Y.Map`/`Y.Array` primitives
- WebSocket connection from browser to sync server: connect, join project, send/receive updates
- `CRDTConflictResolver`: numeric delta merges for numeric properties, user notification for string/enum conflicts
- Yjs awareness: cursor positions, active selections, user colours — broadcast but not persisted
- Local Yjs document persisted to IndexedDB for offline/reload continuity

**Month 5: The 3D viewport and CommandBus.**
- Three.js scene graph initialised and managed by `SceneCommitter`
- `FrameScheduler` with priority tiers running the render loop
- `CommandBus` with Zod validation, optimistic apply, server relay, and rollback
- Basic element interactions: click to select, drag to move, property panel to edit
- LOD system: three tiers (full detail / simplified / bounding box) with distance thresholds
- Undo/redo via Yjs `UndoManager`

**Month 6: AI gateway and first AI feature.**
- LLM gateway route with auth + quota middleware
- `CostMeter`: per-call cap, daily cap, monthly cap, plan-aware model allowlist
- OpenTelemetry spans on every AI call: `pryzm.ai.workflow.${kind}`
- **First AI feature:** Natural language element query
  - User types: "Show me all structural columns on levels 3 to 5 with a section profile smaller than 400x400"
  - LLM translates to a structured query (Zod-validated JSON output, retry on schema mismatch)
  - Query executed against the element graph
  - Results highlighted in the 3D viewport
  - This one feature demonstrates the entire AI pipeline: input → LLM → structured output → validation → action → render

**What "done" looks like at the end of Month 6:**

Two engineers in two different offices, on two different machines, on the same project:
- Both see each other's cursor in 3D space in real time
- When Engineer A moves a column, Engineer B sees it move within 200ms
- When Engineer A types a query to the AI ("show me all walls thicker than 300mm"), the elements highlight on Engineer B's screen too (because the result is applied to the shared model state)
- If one engineer goes offline and comes back, their changes merge automatically
- The cost of that AI query is recorded in the audit log: who asked, which model was used, how many tokens, cost in USD

---

### Months 7–9: Plugin SDK and Performance

**What you are doing:**

The platform opens to extension. The first plugin is built — not by you, but by a discipline engineer who was not involved in building the platform. This is the test of whether the SDK is actually usable. Simultaneously, performance must be validated at scale.

**Month 7: Plugin SDK v1.**
- `plugin.manifest.json` schema: `PluginManifestSchema` with typed permissions and contributions
- iframe sandbox: `sandbox="allow-scripts"`, CSP generated from manifest permissions
- Typed postMessage protocol: `pryzm/host-call`, `pryzm/host-response`, `pryzm/log`
- `PluginActivationContext` with permission-gated host proxies
- Plugin lifecycle: `onActivate(ctx)`, `onDeactivate()`, 5-second timeout kill-switch
- First internal plugin: `pryzm/wall` — registers a wall placement tool, uses `write:project` permission to place walls via the CommandBus

**Critical test:** Give the plugin SDK documentation (not the source code) to a DAR software engineer who was not involved in building the platform. Ask them to build a simple plugin — a panel that lists all structural columns and their section sizes. How long does it take? What questions do they ask? Every question is a documentation gap. Every hour of confusion is a usability bug in the SDK.

**Month 8: Performance validation.**
- Load test the sync server: 100 simultaneous users on the same project, all making changes at 1 change/second. Measure latency, memory, CPU. Find the ceiling.
- Load test the API: 1,000 concurrent users across 50 projects. Measure P99 latency on the most common endpoints.
- Profile the 3D renderer with a 100,000-element model: what is the frame rate? Where does the time go? Is LOD working correctly? Where is GPU memory being consumed?
- Measure IFC import time for files of varying sizes: 10 MB, 50 MB, 100 MB, 500 MB. Establish the baseline. Identify the bottlenecks.

**Month 9: Redis activation and bake worker.**
- Activate Redis for the BullMQ job queue (replace the in-memory queue)
- Bake worker receives geometry computation jobs from the sync server via the queue
- Multiple bake worker instances can now process jobs in parallel (horizontal scaling)
- Coalescing window: multiple rapid changes to the same element are batched into one bake job
- Redis Socket.io adapter: multiple sync server instances can now share the broadcast bus (horizontal scaling of collaboration)

**What "done" looks like at the end of Month 9:**

A discipline engineer who was not involved in platform development has built a working plugin using the SDK. The platform handles 200 simultaneous users without degradation. Redis is running. The bake worker is processing geometry jobs asynchronously. The CI/CD pipeline now includes load tests that gate staging deployments.

---

### Months 10–12: Enterprise Readiness

**What you are doing:**

The platform can be sold to or deployed for a new enterprise client. This means SSO, multi-tenancy enforcement, compliance reporting, a self-hosted deployment package, and a security audit.

**Month 10: Enterprise identity.**
- SAML 2.0 integration (for enterprise SSO — Microsoft Entra, Okta, Google Workspace)
- SCIM provisioning: automatically create/deprovision users when they join/leave the organisation in the identity provider
- Multi-factor authentication (TOTP) for non-SSO users
- Session management: revoke all sessions for a user (for offboarding)

**Month 11: Compliance and reporting.**
- Compliance reporting dashboard: downloadable audit reports showing all state transitions for a given project, time period, and user
- Data retention policy: configurable per-organisation (some projects require 10-year retention; others can be purged after 3 years)
- GDPR data subject access and erasure: export all data for a given user; delete user account and anonymise their historical records in the audit log
- Penetration test: hire an external firm to attempt to breach the platform. Fix every finding before any external client accesses the system.

**Month 12: Self-hosted deployment.**
- Docker Compose package for single-server deployment (small offices, air-gapped environments)
- Kubernetes Helm chart for production-scale deployment
- Operational documentation: how to backup, restore, upgrade, scale, and monitor
- MinIO as S3-compatible object storage (for organisations that cannot use Cloudflare R2 or AWS S3)

**What "done" looks like at the end of Month 12:**

A new enterprise client — a firm that was not involved in development — can be fully onboarded in 2 weeks. Their identity provider (Microsoft Entra) is integrated. Their users can log in. Their projects are isolated from other clients. They can run a compliance report for any project at any time. If they require self-hosted deployment, the Docker package installs and runs correctly on their infrastructure.

---

## Section 4 — The Founding Engineer's Daily Reality

### The 70/20/10 time split

In the first year, a realistic time allocation looks like:

**70% — Writing code.** The founding engineer codes. Every day. If you stop coding for two months to "focus on architecture and leadership," you lose your understanding of the system's actual behaviour — and your credibility with engineers you are about to hire.

**20% — Decision-making and design.** Writing RFCs (Request for Comments documents) for major decisions. Reviewing pull requests. Making technology decisions that are not obvious. Talking to users. Translating user feedback into product requirements.

**10% — Recruiting and people.** Defining job descriptions. Reviewing CVs. Running technical interviews. Onboarding new engineers. This starts small and grows as the team does.

### The mental models that determine success

**"Build the scaffolding, not the building."** Your job is to make the next engineer 5x more productive by the time they join. Every abstraction you build, every API you design clearly, every test you write — these are scaffolding. A founding engineer who builds features without scaffolding creates a codebase that becomes harder to work in as more people join.

**"Make bad patterns impossible, not just discouraged."** If the CommandBus can be bypassed by writing directly to the Yjs document, someone will eventually bypass it — probably with a good short-term reason. If the bypass is architecturally impossible (the Yjs document is not exported from the module that owns it), then the CommandBus contract is enforced automatically. Design the architecture so that the correct path is the easy path.

**"Instrument before you optimise."** You will have opinions about where the performance bottlenecks are. You will be wrong. OpenTelemetry spans tell you the truth. Run under real load, read the traces, optimise what the data shows is slow — not what your intuition suspects.

**"Decisions are cheap; indecisions are expensive."** Make decisions, document why, move forward. A recorded decision that turns out to be wrong is far less damaging than two weeks of indecision while engineers wait for direction. Wrong decisions can be corrected. Paralysis compounds.

### What failure looks like (to avoid)

**Failure mode 1 — Premature scaling.** Building Kubernetes configuration, multi-region databases, and complex sharding logic when you have 50 users. This wastes months of engineering time on problems you do not have yet. The correct posture: design for scale (stateless servers, abstracted queues, no hardcoded singletons), but deploy simply until the metrics demand more.

**Failure mode 2 — Platform without product.** Building a beautiful plugin SDK, a sophisticated command bus, and a well-documented API — while the 3D viewer cannot open a real IFC file without crashing. The platform must prove it works for real users before it opens to extension. The discipline to build end-to-end (even if rough) before building deep is one of the hardest skills in platform engineering.

**Failure mode 3 — Ignoring domain knowledge.** Building a BIM platform without deeply understanding BIM. IFC's spatial hierarchy has quirks (IfcBuildingStorey does not always correspond to a physical floor). ISO 19650's WIP state has nuances that differ from project to project. Revit exports IFC in ways that violate the spec. A platform engineer who treats BIM as a detail to be figured out later will build the wrong abstraction and need to rebuild it when the domain reveals itself.

**Failure mode 4 — The wrong first hire.** The first engineer you hire shapes the culture and the codebase for years. Hiring a strong generalist backend engineer who has no 3D experience and no interest in geometry is a mistake — they will build the backend correctly but be unable to contribute to the rendering pipeline, and you will remain the sole person who can work on the engine for two more years.

---

## Section 5 — Team Structure: Building in Phases

### The principle of deliberate under-staffing

Counter-intuitively, a founding engineering team that is too large fails faster than one that is too small.

With 10 engineers and no architecture, you get 10 different opinions on every decision, 10 different coding styles, 10 different assumptions about how the system works, and 10 people blocked waiting for consensus. The result is slow, incoherent, and expensive.

With 3 engineers and a clear architecture, you move faster. Every decision is made by someone with context. Every line of code is reviewed by someone who understands the system. The architecture stays coherent because the entire system fits in two people's heads simultaneously.

The right team size at each phase is the smallest team that can make meaningful progress. You grow when a specific, identified bottleneck requires another person — not when you feel understaffed in general.

---

### Phase 1: Months 1–6 (3 people)

**Person 1: Founding Platform Engineer (you)**

*Responsibilities:* Everything. Backend, architecture, data model, API, auth, sync server, job queues, DevOps, database schema, CI/CD. You also define the engineering culture: how code reviews work, what "done" means, how decisions are made and recorded.

*What you are NOT doing:* Frontend React work, 3D rendering, geometry — these require specialisation you should not divide your attention with. You do the minimum viable viewer (enough to confirm IFC parsing works), then hand it to Person 2.

*Seniority:* Impossible to overstate — this role requires 8+ years of production experience, specifically including: Node.js server-side development, PostgreSQL at scale, WebSocket/real-time systems, security (auth, RBAC, data isolation), and ideally some exposure to BIM or AEC software.

---

**Person 2: 3D / Rendering Engineer**

*Why this person must be hired in month 1 or 2, not month 6:*

The 3D viewport is not a feature — it is the product. Everything else (collaboration, AI, plugins) has no value if engineers cannot see and interact with the building model in 3D. This person enables everything else. Hiring them late means six months of placeholder 3D work that must be rebuilt.

*What they do in months 1–6:*
- Design and implement the `FrameScheduler` with priority tiers
- Build the `SceneCommitter`: Yjs observe → Three.js scene graph mutation pipeline
- Implement the LOD system: three tiers, distance computation, cross-fade transitions
- Build the geometry instancing system: detect repeated `mesh_hash`, replace with `InstancedMesh`
- Implement the selection system: raycasting, multi-select, selection highlight via instance attribute buffer
- Build the camera system: perspective/orthographic toggle, first-person for site review, plan view
- Profiling: Chrome DevTools Performance tab is their primary tool. Every feature shipped with a measured frame budget impact.

*What this person is NOT:*
- Not a generalist frontend React engineer. React is not the hard part. The hard part is the Three.js scene graph, WebGL shader compilation, GPU memory management, and frame timing.
- Not someone who has "played with Three.js on a weekend project." This requires production Three.js experience — someone who has shipped a large-scale 3D application and profiled it under real load.

*What to look for in the interview:*
- Ask them to explain how they would implement LOD switching without visual pop. The answer should mention cross-fading, distance thresholds, and the trade-off between CPU cost (computing distance every frame) and visual quality.
- Ask them: "A user reports the frame rate drops below 30fps when they scroll out to see the full building. What is your debugging process?" A strong answer walks through GPU profiler, draw call count, triangle count, overdraw, and texture memory — not a guess.
- Ask them: "Why would you use `InstancedMesh` instead of separate meshes for columns on a structural grid?" The answer should cover draw call batching, GPU memory, and the per-instance attribute mechanism for selection/highlight.

*Red flags:*
- "I can learn Three.js" — Three.js is not the skill. 3D rendering fundamentals (the GPU pipeline, draw calls, shaders, the transform hierarchy, spatial data structures) are the skill. Three.js is the API.
- No demonstrable experience with performance profiling in a browser 3D context.
- No understanding of the difference between the CPU scene graph and what actually runs on the GPU.

---

**Person 3: Full-Stack Engineer (React + TypeScript, strong)**

*Why month 2–3 (not month 1):*

The backend and 3D foundation must exist before there is meaningful UI work. If this person arrives in month 1, they will either be idle or build UI on top of a non-existent foundation, which gets thrown away.

*What they do in months 1–6:*
- The React application shell: routing, layout, design system component library
- The property panel: real-time display and editing of element properties (connected to the CommandBus — every edit goes through the bus, not a direct state mutation)
- The project list: loading, creating, naming projects
- The collaboration presence panel: who is online, their colour, their active tool
- The version history panel: list of snapshots, state badges (WIP/Shared/Published/Archived), publish action gated by role
- The AI query interface: text input, streaming progress indicator, result display as highlighted elements in 3D
- The notification system: collaborative conflict notifications, AI completion events, state transition notifications

*The non-obvious requirement:*

This person must understand the state management boundary with absolute clarity: React state holds UI state only (what panel is open, which tab is active, form input values). Model state lives in the Yjs document and is observed by React via a typed store layer. An engineer who tries to put model data in `useState` or `zustand` will break the collaboration layer — the React component would own its own copy of the data, diverging from the Yjs document.

In the technical interview, give them a code review task: show them a React component that does `setWallThickness(newValue)` on state and ask them how they would change it to work correctly in a collaborative context. A strong answer involves observing the Yjs document for changes and dispatching to the CommandBus on user input — not storing state in React.

*Red flags:*
- Primarily a Next.js/SSR engineer. The BIM platform is a single-page application with a complex client-side engine. Server-side rendering concerns are not relevant and SSR expertise can create misleading instincts.
- No experience with real-time state synchronisation (WebSockets, EventSource, or similar).
- Uncomfortable with TypeScript's strict type system. The boundary between the Yjs document and React is enforced entirely by types — a developer who fights the type system rather than working with it will introduce bugs at the most critical boundary.

---

### Phase 2: Months 7–12 (add 2–3 more people)

By month 7, you have a working collaborative 3D BIM editor with AI capabilities. The next hires address specific, identified bottlenecks — not general understaffing.

---

**Person 4: BIM Domain Engineer / Technical Architect**

*Hire when:* The engineering team starts making BIM domain mistakes that a knowledgeable person would catch immediately. This happens at approximately month 5–7 — by then you have enough real IFC files and real user feedback to discover the domain complexity.

*What this person is NOT:*
Not a BIM manager or coordinator who uses Revit. The role requires someone who can read the IFC4X3 schema specification and implement a compliant IFC exporter. This is a rare combination: deep BIM domain expertise + software engineering capability.

*What they do:*
- Own IFC import and export accuracy: an IFC file exported by the platform must be readable by Revit, ArchiCAD, and IfcOpenShell without data loss or schema violations. This requires deep knowledge of how each application interprets IFC entities, their common quirks, and the valid subsets of IFC4X3 that each supports.
- Design the geometry recipes for each element type: how a wall's geometry is constructed from its parameters, including the junction logic (where two walls meet at a corner, what geometry represents the join correctly).
- Advise on the property set model: IFC defines hundreds of standard property sets (Pset_WallCommon, Pset_ConcreteElementGeneral, Qto_WallBaseQuantities...). Which should be first-class fields in the data model? Which should live in the JSONB `properties` column?
- Be the technical reviewer for any AI feature that interprets or generates BIM data. An AI that gets IFC entity types wrong, or generates a wall with properties that violate the schema, needs this person to catch it.

*What to look for:*
- Can they explain the difference between `IfcWall` and `IfcWallStandardCase` without prompting?
- Can they describe the `IfcRelContainedInSpatialStructure` relationship and why it matters for spatial queries?
- Can they read a STEP-format IFC entity line and tell you what it represents?
- Have they shipped software that produces or consumes IFC files?

---

**Person 5: Backend Engineer (infrastructure focus)**

*Hire when:* The founding platform engineer's attention is split too many ways — they are both writing feature code and managing infrastructure. This typically happens at month 8–9 as the Redis/BullMQ activation, bake worker scaling, and performance profiling all demand attention simultaneously.

*What they do:*
- Own the compute infrastructure: bake worker deployment, queue monitoring, dead-letter queue alerting, job retry logic
- Own observability: OpenTelemetry pipeline, Grafana dashboards, alerting rules for all the key metrics (P99 latency, queue depth, AI cost rate, collaboration latency)
- Database maintenance: query performance, index analysis, migration scripts, connection pool tuning
- Security operations: dependency audit automation, secret rotation procedures, penetration test remediation

*What this person is NOT:*
Not a DevOps engineer who does not write application code. This person writes production Node.js — they implement the BullMQ job handlers, the OpenTelemetry instrumentation, the database migration scripts. They happen to also understand the infrastructure those things run on.

*Red flags:*
- "I just set up Kubernetes configurations" — this person needs to understand application code deeply, not just YAML configurations.
- No experience with PostgreSQL performance (index design, query plans, connection pooling). At scale, poorly written SQL is the most common cause of API latency regressions.

---

**Person 6: Developer Experience / SDK Engineer**

*Hire when:* You are about to publish the plugin SDK publicly (or share it with internal discipline teams). This is approximately month 9–10.

*Why a dedicated person for this:*

A plugin SDK is a product in itself. The consumers of the SDK are engineers — they have high standards, low tolerance for ambiguity, and they will not work around documentation gaps the way a non-technical user might. A poorly documented SDK does not get used. An SDK with confusing abstractions gets used wrong, creating support burden.

The Developer Experience engineer's job is to make the SDK genuinely pleasant:
- Comprehensive, accurate API documentation (with code examples that actually work)
- A `create-pryzm-plugin` CLI that generates a new plugin in 30 seconds
- An interactive sandbox environment where plugins can be developed and tested without affecting live projects
- A migration guide for every SDK version (with clear changelogs)
- Office hours and direct communication channels with internal plugin developers

*What to look for:*
- Have they built and shipped a public SDK or API before?
- Can they explain the difference between API design for internal use (you can change it because you own all consumers) and API design for external use (you cannot break consumers — semver, deprecation windows, versioning are mandatory)?
- Do they write? Good SDK documentation is writing skill as much as engineering skill.

---

### Phase 3: Month 12–18 (add 3–5 more, form squads)

At this point the team has 8–10 people and the platform is live with real users. The team structure should shift from "everyone works on everything" to **squads with clear ownership**.

**Squad 1: Platform Core (2–3 engineers)**

Owns: CommandBus, CRDT integration, event log, sync server, bake worker, data model migrations, security, API framework.

The platform core squad's output is stability, performance, and the contracts that other squads depend on. They move slowly and deliberately — their changes affect every other squad. They treat breaking changes to internal APIs with the same gravity as breaking changes to the public API.

**Squad 2: Editor (2–3 engineers)**

Owns: 3D renderer, scene graph, FrameScheduler, LOD system, element manipulation tools, property panel, level management.

The editor squad's output is the user experience of authoring in 3D. They move faster than Platform Core because their changes are self-contained within the editor. Their primary metric is frame rate and interaction latency.

**Squad 3: Integrations (1–2 engineers)**

Owns: IFC import/export, DWG/DXF conversion, Rhino import, BCF integration, Revit add-in, external API.

The integrations squad's output is interoperability. Their primary quality metric is round-trip fidelity: if a model is exported to IFC and re-imported, how much information is lost? The answer should be zero for every supported property set.

**Squad 4: AI (1–2 engineers)**

Owns: AI gateway, cost metering, LLM integration, AI workflows (VoiceCommand, PlanCritique, Generate3Options), AI plugin interfaces.

The AI squad must work closely with the BIM domain engineer (Person 4) — every AI feature that interprets or generates BIM data must be reviewed for domain correctness before shipping.

---

### People to NOT hire (and why in detail)

**Do not hire a DevOps/Infrastructure engineer in the first 12 months.**

Use managed services. Supabase or Neon for PostgreSQL. Redis Cloud for Redis. Railway or Render or Fly.io for deployment. Cloudflare R2 for object storage. These services cost more per unit than self-managed infrastructure, and they cost almost zero in engineering time. An in-house DevOps engineer at this stage adds approximately £80,000/year in salary to save perhaps £10,000/year in infrastructure costs — while consuming significant founding engineer attention for onboarding and coordination.

The trigger for a dedicated infrastructure person: you have a specific, quantified problem that managed services cannot solve (data sovereignty requirements, performance at a scale managed services do not support, regulatory restriction on cloud providers). This is typically a Phase 3 problem.

**Do not hire a product manager in the first 12 months.**

The founding engineer is the product manager. You talk directly to users. You make product decisions. You define the roadmap. A product manager hired too early adds a coordination layer between engineers and users at exactly the moment that direct, unfiltered feedback is most valuable.

The trigger for a product manager: you have more user feedback than you can process, more competing priorities than you can prioritise, and more stakeholders than you can manage. In a 10-person team, this typically appears around month 15–18. Before that, a dedicated product manager is overhead.

**Do not hire a data scientist or ML engineer in the first 18 months.**

You are not training models. You are calling Anthropic's API or OpenAI's API. You do not need someone to design neural network architectures — you need an engineer who can write a well-structured LLM prompt, validate the output against a Zod schema, and retry correctly when the output is malformed. A strong full-stack engineer with an interest in LLMs can do this. A data scientist cannot debug why your IFC parser is producing invalid geometry.

The trigger for a data scientist: you have enough domain-specific BIM data (project histories, element properties, design decisions) to fine-tune a model, and you have evidence that a fine-tuned model would perform meaningfully better than a prompted foundation model. This is not a year-1 concern.

**Do not hire a mobile engineer.**

The platform is a Progressive Web App. It installs on mobile devices, works offline, and renders the 3D model on a tablet for site review. A native iOS or Android app requires a completely separate codebase, a separate rendering pipeline, and Apple/Google App Store dependencies for every release. The PWA is good enough for the use cases that matter in year 1 (site review, markup, read-only access). A native app is a year-3 problem, and only if the PWA demonstrably cannot meet a user need.

---

## Section 6 — The Founding Engineer as Culture Setter

The team culture the founding engineer establishes in months 1–6 persists for years. Specific practices that should be established immediately:

**Architectural Decision Records (ADRs).** Every significant technical decision is written down in a structured document: the context, the decision, the alternatives considered, and the reasons the chosen option was selected. ADRs live in the repository (`docs/adr/`). When a new engineer joins in month 18 and asks "why is properties a JSONB column and not a separate table?", they read the ADR, not Slack history.

**RFC process for major changes.** Before implementing anything that affects more than one system (a change to the CommandBus contract, a new API route, a change to the sync protocol), write a 1–2 page RFC. Circulate it. Give 48 hours for comments. Make the decision explicitly. The RFC becomes a permanent record of the reasoning. This slows down decision-making by 48 hours and saves weeks of rework when the decision is right.

**"No surprise" deployments.** Every deployment to production is preceded by a staged rollout to staging, with automated tests that run against staging before the deployment proceeds to production. No engineer deploys to production from their laptop via a manual `git push`. The CI/CD pipeline is the only path to production. Enforcing this in month 1 avoids the "it works on my machine" category of incidents.

**On-call rotation from day one.** Even with a 3-person team, a formal on-call rotation establishes the expectation that production is everyone's responsibility — not "the DevOps person's" responsibility. When an incident occurs, it is investigated with the same seriousness regardless of whether it is 2 PM Tuesday or 2 AM Saturday. Post-incident reviews are blameless: the question is always "what about the system allowed this to happen?" not "who made this mistake?"

**User feedback loop.** At least one engineer speaks directly to a real user every week. Not through a product manager, not through a summary document — directly. This can be a 30-minute call, a live session where you watch someone use the platform, or a visit to their office. The distance between engineers and users is inversely proportional to the relevance of what engineers build.

---

## Section 7 — Interview Questions for Each Role

### For the 3D / Rendering Engineer

1. "Explain the Three.js render loop and where in it you would apply transform updates from a Yjs observe event."
2. "A user reports that rotating a large model causes frame drops every time they turn past a certain angle. How do you investigate?"
3. "Why does rendering 10,000 separate meshes perform worse than rendering one `InstancedMesh` with 10,000 instances, even if the triangle count is the same?"
4. "Describe the difference between a depth buffer and a stencil buffer and give an example of a BIM editor feature that would use each."
5. "How would you implement a section plane (a horizontal cut plane that reveals the building's interior) in Three.js? What GPU mechanism does it use?"

### For the Full-Stack Engineer

1. "You are given a React component that shows a wall's thickness. The thickness can be changed by the user locally AND by a remote collaborator simultaneously. Walk me through how you would implement this correctly."
2. "Explain what happens when a user types in a property field, presses Enter, and the command fails validation on the server. What does the user experience? What does the code do?"
3. "When would you use `useRef` vs `useState` vs an external store for BIM element state in a React component?"
4. "We use Zod for validation on the CommandBus. Walk me through how you would add a new command type for 'rotate element' including the schema, the handler, and the UI."
5. "A user says the property panel shows the wrong value after they undo a change. How do you debug this?"

### For the BIM Domain Engineer

1. "Explain the IFC spatial hierarchy: IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey → IfcSpace. What is each level responsible for?"
2. "What is a `IfcRelAssociatesMaterial` relationship and how would you represent it in a relational database?"
3. "When importing IFC files from Revit, what are the three most common specification violations you have encountered?"
4. "How does `IfcWallStandardCase` differ from `IfcWall`, and why does it matter for a geometry kernel that needs to compute wall layers?"
5. "Describe the `Pset_WallCommon` property set. Which properties would you store as first-class database columns and which would you leave in JSONB? Defend your choices."

---

*Document prepared for DAR / Sidara Founding Platform Engineer interview — detailed expansion of the founding role and team structure.*
