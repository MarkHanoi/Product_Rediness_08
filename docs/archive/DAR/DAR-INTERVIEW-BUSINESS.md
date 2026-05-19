# Founding Platform Engineer — Technology & Business Alignment Brief
## Enterprise Cloud BIM Authoring Platform · DAR / Sidara

> This document connects the technical decisions of a next-generation cloud BIM platform to the business outcomes that matter for a large AEC enterprise. Written for a technically literate business audience: project leaders, digital transformation officers, and engineering directors who need to understand not just what the platform does, but why each architectural choice has a business consequence.

---

## 1. The Business Problem This Platform Solves

### Where DAR is today (and every large AEC firm)

Large AEC firms typically operate with:
- **Fragmented authoring tools:** Revit for architecture, Tekla for structure, AutoCAD MEP for services — each team works in a different application
- **File-based coordination:** Models shared via email, FTP, or CDE platforms (ACC, SharePoint) with hours of round-trip latency between disciplines
- **Human merge processes:** A coordination manager manually identifies clashes and emails correction requests — a workflow that does not scale
- **Siloed AI experiments:** Individual users running ChatGPT experiments in isolation, with no cost control, no audit trail, and no connection to the actual model data
- **Desktop-first tools:** Software that requires a high-spec workstation, a VPN, and a local installation — incompatible with site access, hybrid working, or global teams

### What this platform changes

| Problem | Platform solution | Business outcome |
|---|---|---|
| Fragmented authoring | Single web-based source of truth | Coordination time reduced by 40–60% |
| File-based handoffs | Real-time CRDT collaboration | Decisions made in hours, not days |
| Manual clash coordination | AI-assisted clash triage | Senior engineers review real clashes, not false positives |
| Uncontrolled AI experiments | Metered, auditable AI gateway | Known AI cost per project, per discipline |
| Desktop dependency | Browser-native, any device | Site access, client access, global team access |
| ISO 19650 compliance as overhead | State machine enforced in code | Compliance is automatic, not a separate process |

---

## 2. Platform vs. Product — The Crucial Distinction

A **product** solves one problem for one user type.
A **platform** creates the conditions for others to solve problems you have not imagined yet.

This distinction is the most important business decision in the founding brief.

### Building a product means:
- Engineering builds every feature for every discipline
- Structural engineers wait for architecture to finish scheduling integration
- DAR's unique workflows (infrastructure BIM, marine, energy) require the product vendor to build each one
- Competitive moat is features — fragile, always catchable

### Building a platform means:
- Structural team builds their own clash-detection plugin on the platform SDK
- Infrastructure division builds a geospatial corridor analysis tool
- External consultants build client-facing reporting plugins
- Engineering builds the engine and the rules; the ecosystem builds the applications
- Competitive moat is the ecosystem — defensible, compounding

**The architectural implication:** The plugin system, the public API, the marketplace, and the SDK are not nice-to-haves. They are the business model. They must be designed with the same rigour as the core editor.

---

## 3. The 10,000-User Architecture — What It Means for the Business

### Why 10,000 users is a different problem than 100

At 100 users, every architectural mistake is recoverable. You can stop the server, fix the bug, restart. Users tolerate downtime.

At 10,000 users:
- A single model-corruption bug can affect hundreds of projects simultaneously
- A 1-second API latency spike at 9 AM creates a flood of support tickets
- A security misconfiguration leaks project data across clients
- A failing AI cost limiter can generate a $200,000 cloud bill in an hour

The platform must be designed for 10,000 users **before** you have 10,000 users. The cost of retrofitting the right architecture is 5–10x the cost of building it correctly at the start.

### The cost of getting the data model wrong

The single most expensive mistake in platform engineering is designing a data model that cannot support the eventual product vision. Changing a data model after thousands of projects have been saved against it requires:
- A migration script that processes every existing record
- Downtime or a shadow migration with dual writes
- A compatibility layer for old data
- Re-testing every API endpoint against the new schema

The founding engineer's primary job in month 1 is to **get the data model right** — not to build features.

### Scalability as a growth enabler, not a technical concern

| Scale tier | Users | Architectural investment | Business gate |
|---|---|---|---|
| Tier 1 | 0–2,000 | Single server, managed DB, Redis | Prove the product works |
| Tier 2 | 2,000–10,000 | Horizontal API servers, Redis adapter, CDN, compute workers | DAR internal rollout complete |
| Tier 3 | 10,000+ | Service extraction, multi-region, vector DB | External licensing / SaaS offering |

The platform is designed so that the transition from Tier 1 to Tier 2 requires **configuration changes and scaling operations, not code rewrites.** This means:
- API servers are stateless from day one (all state in DB/Redis)
- Compute workers are separate processes from day one
- Queue interface is abstracted so swapping in-memory → Redis requires no code change
- A new org can be onboarded without touching existing org data

---

## 4. Real-Time Collaboration — Business Value of the Technical Choice

### Why CRDT matters to a project director, not just an engineer

The technical choice of **CRDT over traditional file-locking** has direct business consequences:

**Traditional file-based model (Revit/BIM 360 today):**
- One user checks out a model — everyone else is blocked
- Coordination requires scheduled sync sessions ("Monday morning federated model review")
- Changes made in parallel must be manually merged by a BIM manager
- Conflicts are discovered at the review session, not at the moment they occur

**CRDT-based model (this platform):**
- Multiple users author simultaneously — no checkouts, no locks
- Conflicts are detected and resolved at the moment they occur (not hours later)
- Discipline leads see each other's changes in real time — decisions happen in the session
- The Monday review becomes a confirmation meeting, not a coordination meeting

**Quantified impact for a 200-person project team:**
- A traditional coordination cycle: 2 days per week for 5 BIM managers × 52 weeks = 520 person-days per year in model coordination overhead
- Real-time collaboration reduces coordination overhead by approximately 60%: 200 person-days saved per year
- At a senior BIM manager cost of £600/day: £120,000 annual saving on one project

### The offline capability matters for site engineers

A structural engineer on a remote site in Saudi Arabia or Kazakhstan does not have reliable internet. The platform's offline mode (reading from the local device cache when offline, syncing automatically on reconnect) means the tool is usable on site, not just in the office. This is a competitive differentiator for an infrastructure-heavy firm like DAR.

---

## 5. AI — The Business Case and the Risk

### What AI actually changes in an AEC workflow

Not everything. AI is not a replacement for engineering judgment. The business case for AI in BIM is narrow but high-value:

**High-confidence use cases (build now):**

1. **Natural language model queries.** An engineer asks "show me all concrete walls with a fire rating below 60 minutes on levels 3 through 7." Today this requires: opening Revit, navigating the schedule view, setting up filters, exporting to Excel. On this platform: type the sentence, get highlighted elements in 3D in 3 seconds. **Time saved: 20–30 minutes per query × hundreds of queries per project.**

2. **Change summarization between versions.** "What changed between the issued version and today's model?" Today: manual visual comparison or a Revit change detection plugin. On this platform: diff of two Yjs snapshots → structured summary with affected element count, changed properties, and flagged coordination risks. **Coordination risk identified immediately.**

3. **Quantity extraction from specification PDFs.** Parsing a 300-page structural specification to extract material properties, fire ratings, and load requirements into BIM property sets: days of manual data entry. AI + OCR pipeline: hours. **Accuracy improves, engineers freed from transcription.**

4. **Clash triage.** A standard clash detection run on a large building produces 10,000+ clash reports. 80% are false positives (bolts touching insulation, pipes within tolerance). An ML classifier trained on resolved clashes from previous projects can rank by severity and flag only the 2,000 real issues. **Senior engineer time directed to real problems.**

**Use cases to approach carefully:**

- **Generative design:** Useful for early massing studies; unreliable for detailed structural design where precise constraints are critical
- **Compliance checking:** AI can flag potential issues; a human engineer must sign off. AI is advisory, not authoritative. Legal liability remains with the engineer.

**Use cases to avoid:**

- **AI-generated structural geometry:** Hallucination in a structural element is a building safety risk. AI does not generate load-bearing geometry autonomously on this platform.
- **AI-managed access control:** Authentication and permissions are deterministic. AI cannot be involved in access decisions.

### The AI cost control problem

Uncontrolled AI access is a CFO's nightmare. A large project team of 200 engineers, each running AI queries without cost controls, can generate £50,000+ per month in LLM API costs — invisible until the cloud invoice arrives.

The platform solves this architecturally:
- Every AI call is metered per user, per project, per workflow type
- Per-call limits, daily limits, and monthly limits are enforced before the call is made — not after
- Cost is attributed to the project P&L, not an undifferentiated IT budget
- The CFO dashboard shows AI spend by project, by discipline, by workflow — the same granularity as any other project cost

---

## 6. ISO 19650 — Compliance as a Product Feature, Not a Checkbox

### What the regulation requires

ISO 19650 mandates a specific information management lifecycle for BIM deliverables:
- Documents pass through defined states: **WIP → Shared → Published → Archived**
- Only certain roles can move documents between states
- Every state transition must be recorded with actor, timestamp, and reason
- Published documents cannot be retroactively modified
- Archived documents are immutable and permanently traceable

### How most firms comply today

A BIM coordinator manually tracks document states in a spreadsheet or a CDE platform (ACC, ProjectWise) that enforces states at the file level. This creates:
- State tracking disconnected from the actual model data
- Audit trail that is a human-maintained record, not a system record
- Compliance review that requires a manual audit, not a database query

### How this platform makes compliance automatic

The ISO 19650 state machine is implemented as a code constraint, not a process:
- Every project version has a `state` field: `wip | shared | published | archived`
- State transitions are enforced by the API — it is **impossible** to modify a `published` document via the API, regardless of client-side state
- Only users with the `Appointing Party` role can approve a transition to `published`
- Every transition writes an immutable audit entry: who, when, from which state, to which state, and any rejection reason
- Compliance reporting is a database query, not a manual audit

**Business consequence:** ISO 19650 compliance is not a project overhead — it is the default behaviour of the platform. Project teams do not need to learn a compliance process; they use the tool, and compliance happens automatically.

---

## 7. Interoperability — The "Complement, Don't Replace" Strategy

### The wrong approach: replace everything immediately

Telling 500 Revit users they must switch to a new tool on day one is a change management failure. Resistance, low adoption, and eventually the tool is abandoned.

### The right approach: become the coordination layer first

Phase 0 (months 1–6): The platform consumes IFC exports from every existing tool. Users see their models in a better viewer. The platform adds value without disrupting workflows.

Phase 1 (months 6–18): The platform becomes the coordination and review system. Revit and Archicad remain for detailed parametric authoring. The platform owns collaboration, AI queries, documentation, and ISO 19650 lifecycle.

Phase 2 (18+ months): Common element types are authored natively in the platform. Revit use declines naturally as users find native authoring faster for standard elements.

This approach has a name in technology strategy: **land and expand**. Start where you add the most value with the least friction. Grow from there.

### Why IFC is the enabling technology

IFC is the only open, vendor-neutral standard for BIM data exchange. It is the bridge between every authoring tool. By making IFC import and export first-class (not an afterthought), the platform can receive data from any tool, enrich it with AI and collaboration, and return data to any tool.

A platform that speaks IFC fluently is compatible with the entire AEC ecosystem. A platform that doesn't is an island.

---

## 8. Security — The Business Risk of Getting It Wrong

### What a security breach means for an AEC firm

A major infrastructure firm's project data — structural drawings, site survey data, client specifications — is commercially sensitive. A breach affecting:
- **Client data:** Contractual liability, relationship damage, potential regulatory fines
- **Structural designs:** Competitive exposure (competitors could access unpublished structural systems)
- **Government infrastructure projects:** Potential national security implications in some jurisdictions

### The security architecture in business terms

Every security decision maps to a business risk:

| Security measure | What it prevents | Business risk mitigated |
|---|---|---|
| Server-side RBAC (roles from DB, not client) | Client-side role spoofing | A user cannot grant themselves admin access |
| Data isolation (`WHERE org_id = $1`) | Cross-tenant data leakage | Project data from Client A cannot reach Client B |
| Rate limiting on AI endpoints | Cost runaway attack | A compromised account cannot generate £100k in AI charges |
| Append-only audit log | Audit trail tampering | Compliance disputes are resolved by the system record |
| ISO 19650 state machine as code | Unauthorized document modification | Published documents cannot be altered, even by admins |
| Plugin sandbox (iframe + CSP) | Malicious plugin escaping sandbox | A third-party plugin cannot exfiltrate model data |
| Presigned object storage URLs | Direct bucket access | IFC/GLB files not publicly accessible without authentication |

### Self-hosted deployment for data sovereignty

Many governments and regulated clients (e.g., defence, government infrastructure) require that data does not leave their jurisdiction or their control. The platform is packaged as a Docker Compose / Kubernetes deployment that runs entirely on the client's infrastructure.

This is not a concession — it is a sales argument. "Enterprise SaaS that can also be self-hosted" is the premium positioning for enterprise sales in the AEC sector.

---

## 9. The Founding Engineer Role — What Success Looks Like

### Month 1–3: Architecture + core data model
- Define the element data model (the decision that cannot be undone)
- Set up CI/CD, staging, production
- IFC import pipeline working end-to-end
- Authentication and project CRUD

**Success measure:** A real IFC file from a real project loads in the browser at interactive frame rate.

### Month 4–6: Collaboration + AI baseline
- Yjs CRDT collaboration working for two simultaneous users
- AI gateway with cost metering operational
- First AI feature: natural language element query
- ISO 19650 state machine enforced

**Success measure:** Two engineers in different offices coordinate on the same model in real time. An AI query returns correct results and the cost is logged.

### Month 7–12: Plugins + scale
- Plugin SDK v1 published
- First internal plugin built by a discipline team (not the platform team)
- Platform handling 500 concurrent users without performance degradation
- Redis/BullMQ activated; horizontal API scaling tested

**Success measure:** A discipline team built something the platform team did not anticipate. The platform can absorb 5x the initial load.

### Month 13–18: Enterprise hardening
- SAML/SSO for enterprise identity providers
- Multi-tenancy fully enforced and penetration-tested
- Compliance reporting dashboard
- Self-hosted deployment package

**Success measure:** The platform can be sold to a new enterprise client with a 2-week onboarding timeline.

---

## 10. Team Structure — Who to Hire and When

### The minimum viable team for months 1–6

| Role | Why critical | Earliest mistake |
|---|---|---|
| **Founding platform engineer** (you) | Architecture, backend, DevOps | Hiring backend engineers first who make the API fast before the 3D viewer works |
| **3D/rendering engineer** | The 3D viewer *is* the product. No generalist can do this | Assigning this to a generalist. The rendering pipeline, WASM geometry, and performance profiling require deep specialization |
| **Full-stack engineer** | React, state management, collab UX, AI integration | Hiring junior. The complexity of the state management boundary requires seniority |
| **BIM domain expert** (part-time or advisor) | IFC schema quirks, AEC workflow knowledge, prevents expensive domain mistakes | Skipping this entirely. Platform engineers without BIM knowledge rebuild what the industry already solved in 1994 |
| **Designer** (part-time) | Spatial UI/UX for complex 3D interfaces is a specialism | Using a generalist web designer. BIM workflows have unique UX patterns |

### What NOT to hire in months 1–6

- **DevOps engineer:** Use managed services (Supabase, Redis Cloud, Railway). Operational complexity is a scaling problem, not a month-1 problem.
- **Data scientists:** Not needed until training custom models, which is months 18+
- **Mobile engineers:** PWA handles mobile. A native app is a Phase 3 problem.
- **Product managers:** The founding engineer *is* the product manager for the first 6 months. You must own the product decisions alongside the architecture decisions.

---

## 11. Build vs. Buy vs. License — The Key Decisions

Not everything needs to be built. The founding engineer must know what to buy, what to license, and what to build.

| Component | Decision | Rationale |
|---|---|---|
| IFC parser | License (`web-ifc`, open-source) | C++ library written by IFC experts. Building from scratch is 18 months of work. |
| 3D rendering | License (Three.js, open-source) | Mature, battle-tested, large ecosystem. Custom WebGL renderer is unnecessary. |
| CRDT library | License (Yjs, open-source) | Mathematically proven. Implementing your own CRDT is a multi-year research project. |
| AI models | Use API (Anthropic/OpenAI) | Training custom foundation models is a £10M+ investment. Use via gateway. |
| Collaboration infrastructure | Build | The CRDT integration with BIM semantics is a core competitive differentiator. |
| BIM data model | Build | The element graph is the foundation. No off-the-shelf model fits enterprise BIM semantics. |
| Plugin sandboxing | Build | Custom CSP/iframe model is required for the specific permission set. |
| Object storage | License (Cloudflare R2 / MinIO) | Commodity infrastructure. No competitive advantage in building it. |
| PostgreSQL | License (managed) | The query patterns are standard. No need for a custom database. |
| CI/CD | License (GitHub Actions) | Standard toolchain. |

The build/buy decision rule: **build when the component is a competitive differentiator; buy when it is commodity infrastructure.**

---

## 12. Risk Register — What Can Go Wrong

### Technical risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Data model locked in early, hard to change | High | Very High | Month 1 is entirely the data model. No feature work before schema is validated. |
| 3D viewer fails on real-world IFC files | Medium | Very High | Month 2 milestone: render a 100 MB real project file at 60 fps. Non-negotiable. |
| CRDT integration added late | Medium | High | Integrate Yjs in month 3, not month 9. Bolting it on later is a rewrite. |
| AI costs uncontrolled | High | High | Cost metering enforced before first AI call, not after first invoice. |
| Security breach due to RBAC misconfiguration | Low | Catastrophic | Server-side role enforcement, penetration test before first external user. |
| Performance cliff at 5,000 users | Medium | High | Load test to 2x expected user count before public launch. |

### Organizational risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Discipline teams resist adopting new tool | High | High | Phase 0 is read-only. No workflow disruption until trust is established. |
| Platform team builds features instead of platform | High | High | Plugin SDK is the discipline team's interface. Core team builds the engine. |
| Key 3D engineer leaves | Medium | Very High | Document the rendering architecture. No single point of failure in team knowledge. |
| Scope creep: "add Revit feature X" requests | Very High | Medium | Published roadmap with explicit "not in scope" list. Founding engineer enforces platform thinking. |

---

## 13. The Strategic Conversation — Questions to Drive

When speaking with DAR's leadership, these questions reveal whether the initiative is serious:

**On scope and vision:**
- Is the goal to build an internal tool for DAR projects, or eventually a platform that other firms can use?
- Is DAR open to replacing Revit for common elements, or is this permanently a coordination layer on top of existing tools?
- What existing CDE platforms (ACC, SharePoint, ProjectWise) does DAR use, and what is the integration expectation?

**On ownership:**
- What architectural decisions are already made vs. still open?
- Who has the authority to say "we will not build that" when discipline teams request features that belong in a plugin?
- Is there an existing engineering team, or is this built from zero?

**On timeline:**
- What does success look like at 6 months / 12 months / 24 months?
- When is the first pilot project planned, and what does "ready" mean for that pilot?
- Is there a budget for external pilot users (3 client firms) in month 12?

**On risk tolerance:**
- Is DAR comfortable with a phased approach (view first, author later), or is there pressure to deliver authoring capability immediately?
- What is the acceptable downtime/data loss tolerance? (This drives the infrastructure investment.)

---

## 14. The One-Line Summary for Every Stakeholder

| Audience | What this platform is |
|---|---|
| CEO / Managing Director | The platform that makes DAR's 10,000 engineers collaborate in real time on the same model, with AI assistance and automatic compliance, from any device, anywhere in the world. |
| CFO / Finance Director | A controlled AI and cloud spend system with per-project cost attribution, replacing an unpredictable patchwork of individual software licenses and manual coordination overhead. |
| Project Director | The coordination tool that eliminates the Monday morning clash review and replaces it with a live, AI-assisted view of every conflict the moment it occurs. |
| BIM Manager | The platform that enforces ISO 19650 automatically, makes the audit trail a database query, and lets every discipline work in real time without checking files in and out. |
| Structural Engineer | A browser-based authoring environment where I can see what the architect just changed, ask the AI to find all walls affected by my new structural grid, and coordinate without sending a single email. |
| IT / Security Director | A multi-tenant platform with server-side RBAC, end-to-end TLS, append-only audit trails, and a self-hosted deployment option for sensitive government projects. |

---

*Document prepared for DAR / Sidara Founding Platform Engineer interview — Technology and Business Alignment.*
