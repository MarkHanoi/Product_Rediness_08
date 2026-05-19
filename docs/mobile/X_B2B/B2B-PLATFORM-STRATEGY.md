# PRYZM — B2B Platform Strategy: Deep Technical & Business Analysis

**Date:** 2026-03-18  
**Type:** Strategic architecture analysis — no code changes  
**Scope:** How to open PRYZM's technology to third-party companies (furniture makers,  
interior designers, architects) without exposing source code, while deciding on  
the ThatOpen dependency.

---

## Part 1: What You Actually Have (Asset Inventory)

Before deciding how to open the platform, you need to understand exactly which parts
are valuable proprietary IP and which parts are commodity infrastructure.

### 1.1 Your Proprietary IP (What You Protect)

| Asset | Location | Why It's Valuable |
|-------|----------|-------------------|
| **Semantic BIM Model** | `src/elements/*/Store.ts` | The typed, structured, immutable data model for all 12 element types. 2+ years of schema design work. |
| **Command System** | `src/commands/` | Full undo/redo, validation, transactional mutations — the "transaction log" of a building |
| **Constraint Engine** | `src/commands/*` (canExecute) | Architectural rule validation built into every mutation |
| **Parametric Builders** | `src/elements/*/Builder.ts` | The algorithms that turn semantic data into real 3D geometry |
| **Spatial Reasoning** | `src/core/`, `BimManager` | Level management, grid, spatial containment, relationship graph |
| **AI Intent System** | `src/ai/` | Structured intent vocabulary, AI→Command bridging, approvals |
| **IFC Export Pipeline** | `src/export/ifc/` | Full IFC4 authoring chain |
| **Entitlement System** | `src/monetization/` | Plan → feature gating already built |

### 1.2 Commodity Infrastructure (Can Be Replaced or Exposed Freely)

| Asset | Current Implementation | Notes |
|-------|----------------------|-------|
| 3D Renderer | Three.js (via ThatOpen wrapper) | Replaceable |
| Auth | Clerk | Swappable |
| Database | Supabase (PostgreSQL) | Standard |
| BIM UI | `@thatopen/ui` | Replaceable |
| Server | Express | Standard |
| Fragment format | `@thatopen/fragments` | Internal only |

### 1.3 Your Actual Product (the Combination)

The value you have is not any single piece — it's that **the Semantic Model, the Command
System, and the Builders all work together as a single coherent architecture**. No third
party can recreate this quickly. This is what B2B customers are really paying for.

---

## Part 2: Who Are Your B2B Customers?

Understanding the customer type determines which API shape you need.

### Type A — Furniture / Product Companies

**Who:** IKEA, Minotti, Cassina, B&B Italia, local kitchen makers.  
**What they want:** Embed a 3D configurator that outputs to IFC so their products
can be placed in architectural projects. They don't care about walls or slabs —
they care about their furniture being BIM-accurate.  
**What they need from you:** A headless `addFurniture(productId, position, levelId)`
API and IFC export. They want to call your engine from their e-commerce site.  
**Risk level:** Low. They won't try to reverse-engineer your wall builder.

### Type B — Interior Design Platforms

**Who:** Houzz, Homestyler, Planner 5D, local studios.  
**What they want:** A full BIM-capable 3D editor embedded inside their platform,
without building one themselves.  
**What they need from you:** An embeddable viewport (SDK or iframe) with a subset
of your tools — furniture, finishes, room dimensions, IFC/GLB export.  
**Risk level:** Medium. They'll want deep customization.

### Type C — Architecture / Construction Firms

**Who:** Small-to-mid architecture firms that don't want to pay Autodesk £10k/seat.  
**What they want:** Either PRYZM itself (white-label) or an API to feed data into
their existing workflow tools.  
**What they need from you:** Full platform (white-label) + REST API for
Revit/BIM360 integration + IFC import/export.  
**Risk level:** Low code-exposure risk. High integration complexity.

### Type D — BIM Tool Builders (Developers)

**Who:** Startups building structural analysis plugins, quantity surveyors, cost
estimators, facilities managers.  
**What they want:** A stable, documented API to read and write BIM model data
(elements, levels, properties, relationships) from their own tools.  
**What they need from you:** A REST/GraphQL/WebSocket API over the semantic model
and a webhook system for change events.  
**Risk level:** Low. They don't see your code — just your API.

---

## Part 3: Four API Shapes — What Each Means for You

### Shape 1: Headless REST API (Recommended First Step)

**What it is:** A documented HTTP API. Customers make API calls to create/read/
update/delete elements, export IFC, run AI analysis. Your server handles everything.
Your source code is never exposed.

**What it looks like:**
```
POST /api/v1/projects/{id}/elements
  { type: "wall", startX: 0, startZ: 0, endX: 5, endZ: 0, height: 2.7, levelId: "L1" }

GET  /api/v1/projects/{id}/elements?type=furniture

POST /api/v1/projects/{id}/export/ifc

POST /api/v1/projects/{id}/ai/suggest
  { instruction: "check all stair widths for accessibility compliance" }

GET  /api/v1/projects/{id}/elements/{elementId}
DELETE /api/v1/projects/{id}/elements/{elementId}
```

**What you build:**
- An Express router that validates API keys, calls your existing Command system
  internally, and returns JSON.
- Your command system (CreateWallCommand, etc.) already has all the logic.
  The API is just a thin HTTP adapter on top.
- Authentication: API keys per company (stored in Supabase), linked to plan/entitlements.

**What your code change looks like internally:**
```
HTTP POST /api/v1/elements
  → validate API key
  → read plan limits (your existing EntitlementStore logic)
  → construct CreateWallCommand (your existing code)
  → execute via CommandManager
  → serialize result to JSON
  → return response
```

**Pros:** Zero code exposure. Works for Type A (furniture), Type D (tool builders).  
**Cons:** No 3D viewport for customers. Type B (interior designers) won't get a
visual editor from a REST API alone.  
**Time to build:** 2–4 weeks. Your command pattern is already designed for this.

---

### Shape 2: JavaScript SDK (npm package, compiled)

**What it is:** A published npm package (`@pryzm/sdk` or `pryzm-sdk`) that
customers install in their own app. The package contains compiled TypeScript
(no readable source) that spins up a PRYZM viewport inside a `<div>`.

**What the customer writes:**
```javascript
import { PryzmViewer, createWall, addFurniture, exportIFC } from 'pryzm-sdk';

const viewer = new PryzmViewer({ container: '#my-div', apiKey: 'their-key' });
await viewer.init();

const project = await viewer.loadProject('proj-123');
const wall = await project.createWall({ start: [0,0], end: [5,0], height: 2.7 });
await project.addFurniture({ type: 'sofa', position: [2, 0, 1], levelId: 'L1' });

const ifcBytes = await project.exportIFC();
```

**How it works under the hood:**
- The SDK is your existing engine, bundled with Vite/Rollup with tree-shaking,
  minified, and source maps disabled.
- It makes API calls back to your servers for validation, persistence, and AI.
- The 3D rendering happens client-side (in their browser) — you're not paying
  for GPU server time.
- You can ship the SDK on npm as a private package (paid npm Org) or via a CDN.

**What source protection looks like:**
- Vite's `build.minify: 'terser'` + `build.sourcemap: false`.
- Terser obfuscation (`mangleProps`, identifier renaming).
- Module bundling means all internal class names are renamed — no readable structure.
- Legal: SDK license agreement prohibiting decompilation (standard SaaS SDK terms).

**Pros:** Customer gets a full visual BIM editor embedded in their product.
Works for Type B (interior design platforms). Your code is compiled/minified.  
**Cons:** A determined reverse-engineer can still read minified JS. Cannot fully
hide algorithms — only obfuscate them. Also: SDK updates require customers to
upgrade their package.  
**Time to build:** 4–8 weeks for the first version. Requires defining a clean
public API surface (what functions are exported).

---

### Shape 3: Embedded Iframe + PostMessage API

**What it is:** PRYZM runs entirely on your servers. Customers embed it in their
page via `<iframe src="https://app.pryzm.io/embed?apiKey=...&projectId=...">`.
Communication happens via `window.postMessage`.

**What the customer writes:**
```html
<iframe id="pryzm" src="https://app.pryzm.io/embed?apiKey=abc&project=123"></iframe>
<script>
  const frame = document.getElementById('pryzm');
  
  // Send commands to PRYZM
  frame.contentWindow.postMessage({ action: 'createWall', payload: {...} }, '*');
  
  // Listen for events from PRYZM
  window.addEventListener('message', (e) => {
    if (e.data.event === 'elementCreated') { ... }
    if (e.data.event === 'exportReady')    { window.open(e.data.downloadUrl); }
  });
</script>
```

**Pros:** Maximum code protection — customers literally cannot see your code.
Zero SDK versioning problems. Works immediately — no npm publish needed.  
**Cons:** Limited visual customization (customers can't restyle your viewport
without an agreed theming API). Cross-origin security restrictions apply.
Iframe UX can feel disconnected in some products.  
**Time to build:** 1–2 weeks. Mostly adding a postMessage event bus and
an `/embed` route with configurable whitelabeling.

---

### Shape 4: Plugin/Extension System (Figma-style)

**What it is:** PRYZM exposes a sandboxed Plugin API. Third parties write plugins
that run inside PRYZM's UI, accessing BIM data via a controlled interface — similar
to how Figma, Rhino, or VS Code handle extensions.

**What a furniture company plugin looks like:**
```typescript
// Plugin written by IKEA, runs inside PRYZM sandbox
import { PryzmPlugin, BimReadModel, Command } from '@pryzm/plugin-sdk';

export default class IKEACatalog extends PryzmPlugin {
  onActivate(bim: BimReadModel) {
    this.showPanel('IKEA Catalog');
    this.onElementSelected((element) => {
      if (element.type === 'room') this.showProductsForRoom(element);
    });
  }
  
  insertProduct(product: IKEAProduct, position: Vector3) {
    this.requestCommand('addFurniture', {
      furnitureType: product.pryzmType,
      position,
      metadata: { ikeaArticleNumber: product.articleNo }
    });
  }
}
```

**How sandboxing works:**
- Plugin code runs inside a sandboxed Web Worker or a secured iframe with no
  direct DOM access.
- The Plugin API (BimReadModel) gives read access to stores but cannot call
  builders, stores, or scene directly.
- Write access goes through a `requestCommand()` bridge — PRYZM validates and
  executes the command; the plugin never sees your Command internals.
- This is exactly how Figma's plugin API works.

**Pros:** Richest ecosystem play — can attract a developer community.
Plugins run inside PRYZM UI. Source fully protected.  
**Cons:** Most complex to build and maintain. Requires clear versioning of the
Plugin API. Plugins can still cause UX issues if poorly written.  
**Time to build:** 3–6 months for a production-grade plugin sandbox.

---

## Part 4: Recommended Rollout Strategy (Phased)

Given your existing architecture, here's the recommended order:

### Phase 1 (Months 1–3): REST API + iframe Embed

**Why start here:** Your server already has Express, Supabase, Clerk, rate limiting,
and an entitlement system. The command system is already isolated. Adding a REST API
adapter is the lowest-risk, fastest time-to-revenue approach.

**What to build:**
1. `POST /api/v1/auth/token` — API key issuance (map to Supabase `api_keys` table)
2. `CRUD /api/v1/projects` — create/read projects
3. `CRUD /api/v1/projects/:id/elements` — element CRUD (wraps existing commands)
4. `POST /api/v1/projects/:id/export/ifc` — export (already gated by your auth)
5. `GET  /api/v1/projects/:id/snapshot` — full model snapshot as JSON
6. `POST /api/v1/projects/:id/ai/suggest` — forward to your AIService

Simultaneously: Add an `/embed` route that renders the PRYZM viewport with
configurable UI (hide specific tools, apply a brand color) via URL params.

**B2B billing:** Use your existing plan system. Add an `api_tier` table to
Supabase: `{ company_id, plan: 'starter'|'pro'|'enterprise', requests_per_month }`.

**Target customers:** Type D (tool builders), Type A (furniture, for catalog
data ingestion), Type C (architecture firms needing IFC round-trip).

---

### Phase 2 (Months 4–8): JavaScript SDK

**Why second:** Now that the REST API is proven, the SDK wraps it with a
convenience layer and adds the visual component.

**What to build:**
1. Define the SDK's public API surface: `PryzmViewer`, `Project`, `ElementCollection`
2. Extract the engine initialization from `EngineBootstrap.ts` into an importable
   `PryzmEngine` class (no window globals in the SDK build)
3. Build a separate Vite config for the SDK bundle (not the app bundle)
4. Publish to npm private registry or distribute via CDN

**Target customers:** Type B (interior design platforms) who want a visual BIM
editor inside their product without building one.

---

### Phase 3 (Months 9–18): Plugin SDK

**Why third:** The plugin system attracts a developer ecosystem around your
platform — this is the flywheel that creates compounding value.

**What to build:**
1. `@pryzm/plugin-sdk` — the sandboxed plugin API (read model, command request bridge)
2. Plugin manifest format (`plugin.json` with id, name, permissions, entry point)
3. Plugin registry (marketplace or private registry for enterprise)
4. Plugin sandbox (Web Worker + postMessage bridge to the main thread BimReadModel)

**Target customers:** All types. Especially Type D (tool builders) and specialist
software companies (structural engineers, quantity surveyors, MEP consultants).

---

## Part 5: The ThatOpen Question

This is the most technically critical decision. Here's the honest analysis.

### What ThatOpen Does for You Right Now

| ThatOpen Package | What It Gives You | Can You Replace It? |
|------------------|--------------------|---------------------|
| `@thatopen/components` | Three.js World, camera, renderer lifecycle, component manager | Yes, with ~3 months of work |
| `@thatopen/components-front` | Orbit controls, section planes, edge renderer | Yes, Three.js has these built-in |
| `@thatopen/ui` | `bim-viewport`, BIM-specific Web Components | Yes — Vue/React/vanilla |
| `@thatopen/fragments` | Fragment-based optimized rendering format | Yes, but costly |
| IFC reading (internal) | IFC file parsing (you use web-ifc directly) | Already independent |

### The Real ThatOpen Risks

**Risk 1: Licensing for Commercial Distribution**  
ThatOpen is MIT licensed today. If you distribute PRYZM as an SDK (npm package),
your customers indirectly ship ThatOpen's code. MIT allows this, but if ThatOpen
changes to a commercial license (like HashiCorp/Redis did), you'd need to either
pin the old version or rebuild.

**Risk 2: Fragment Format Lock-In**  
Fragments is ThatOpen's proprietary geometry format for BIM. It's fast, but it's
not a standard format. If you expose an SDK that internally uses Fragments, and
ThatOpen changes the format, your SDK breaks. Your customers would feel this.

**Risk 3: Plugin API Conflicts**  
If you want to build a Plugin System (Phase 3), customers writing plugins may import
`@thatopen/components` directly — creating version conflicts between your bundled
version and theirs.

**Risk 4: UI Components as a Product Constraint**  
`@thatopen/ui` uses Web Components. If a B2B customer wants to embed your viewer
inside a React or Angular app, Web Components sometimes cause integration friction
(event bubbling, styling, SSR issues).

### The Decoupling Analysis

**What "decouple from ThatOpen" actually means:**

Option A — **Full Vanilla Three.js** (Replace everything):
- Remove `@thatopen/components`: Replace with direct Three.js scene management.
  The Three.js `WebGLRenderer`, `PerspectiveCamera`, `OrbitControls` are all
  available standalone. This is what ThatOpen wraps anyway.
- Remove `@thatopen/ui`: Replace with your own React/Vue components or Web Components.
- Remove `@thatopen/fragments`: Switch your builders to emit standard
  `THREE.BufferGeometry` meshes directly. Your existing builders already do 90% of
  this — the Fragment format is just a serialization optimization.
- Remove Fragment streaming: Not needed for an authoring tool working on projects
  under 50,000 elements.

**What you gain:** Zero third-party framework dependency in your core engine.
Full control. SDK is self-contained. No upstream license risk.

**What it costs:** Approximately 6–10 weeks to rip out ThatOpen and rebuild the
world setup, camera management, and rendering pipeline from scratch. Your builders
and stores would be untouched — the decoupling is entirely in the engine layer.

Option B — **Isolate ThatOpen behind an Adapter** (Recommended):
- Create an internal `IRenderingEngine` interface.
- Move all ThatOpen calls behind this interface.
- The rest of your code (stores, commands, builders, AI) never imports ThatOpen.
- For the SDK, you ship ThatOpen alongside your code (it's MIT).
- If you ever need to replace ThatOpen, you only swap the adapter — not the
  entire codebase.
- This is 2–3 weeks of work, not 6–10.

Option C — **Keep ThatOpen as-is, manage the risk**:
- Continue as-is internally.
- For REST API and iframe embed (Phase 1), ThatOpen is completely invisible
  to B2B customers — they never install it.
- For the SDK (Phase 2), bundle ThatOpen inside the SDK with a fixed pinned version.
  Add a clause in your SDK license: "Do not import @thatopen directly; use PRYZM's
  bundled version."
- Re-evaluate at Phase 3 when/if plugin conflicts arise.

### Recommendation on ThatOpen

**Do not do a full rewrite now.** The business risk of spending 6–10 weeks decoupling
outweighs the technical benefit at this stage. Instead:

1. **For Phase 1 (REST API + iframe):** ThatOpen is irrelevant to B2B customers.
   Keep it.
2. **Before Phase 2 (SDK):** Spend 2–3 weeks isolating ThatOpen behind an
   `IRenderingEngine` adapter. This protects you for Phase 2 and 3 without a rewrite.
3. **Re-evaluate at Phase 3:** By the time you build the plugin system, you'll know
   whether ThatOpen's licensing and Fragment format are causing real problems.

**The short answer:** For REST API and iframe — keep ThatOpen, it's invisible.
For SDK — isolate it behind an adapter. Never do a full vanilla rewrite until
you have a concrete licensing or compatibility problem forcing it.

---

## Part 6: How to Protect Your Code (Technical & Legal)

### Technical Protection

| Method | What It Protects | Strength |
|--------|-----------------|----------|
| REST API (server-side) | 100% of logic stays on your server | ████████████ Strong |
| Iframe embed | 100% of logic stays on your server | ████████████ Strong |
| Compiled/minified SDK | Obfuscates logic; prevents casual reading | ████████░░░░ Medium |
| Terser + property mangling | Renames all identifiers | ████████░░░░ Medium |
| Source map disabled | No readable map of minified code | ████████░░░░ Medium |
| Web Workers for sensitive logic | Logic runs in isolated thread | ██████░░░░░░ Medium |
| Server-side validation of all mutations | Clients can't bypass business rules | ████████████ Strong |

**The most important principle:** Any logic that is a core business secret (your
AI system, your constraint engine, your IFC export) should run **server-side**, not
client-side. Then it doesn't matter if someone decompiles the SDK — the intelligence
lives on your server.

For your specific case:
- **Semantic model + command execution:** Run server-side via the REST API.
- **3D rendering:** Must run client-side (GPU). This is less sensitive.
- **AI suggestions:** Already server-side (calls your API). Keep it there.
- **IFC export:** Should move to server-side for the B2B API (currently client-side).

### Legal Protection

1. **Terms of Service** for API access: Prohibit reverse-engineering, competitive
   use, and redistribution of SDK code.
2. **SDK EULA**: "License to use, not to copy." Standard for commercial SDKs.
3. **API key binding to company**: Each API key is scoped to a registered company,
   logged, rate-limited. Misuse is detectable.
4. **Watermarking**: Embed an invisible identifier in IFC exports tied to the
   API key. If PRYZM-generated IFC files appear in a competitor's product,
   you can trace the source.

---

## Part 7: What You Need to Build — Concrete List

### Server-Side (Express + Supabase)

| Component | Description | Complexity |
|-----------|-------------|-----------|
| API Key Management | Issue, rotate, revoke keys per company | Low |
| API Rate Limiter (per key) | Extend your existing rateLimiter.js | Low |
| Company Onboarding | Register company, assign plan, issue keys | Low |
| Element CRUD routes | Map to existing commands (wall, slab, etc.) | Medium |
| IFC export route | Move client-side export to server (already in src/export/) | Medium |
| Webhook system | Fire HTTP events to customer URLs on element changes | Medium |
| Usage metering | Count API calls per key, enforce plan limits | Low |
| GraphQL layer (optional) | Add Apollo over the REST routes for complex queries | Medium |

### Client-Side (for iframe / SDK)

| Component | Description | Complexity |
|-----------|-------------|-----------|
| `/embed` route | Render PRYZM viewport with API-key-configured UI | Low |
| PostMessage event bus | Two-way communication for iframe customers | Low |
| White-label config | Brand colors, logo, tool visibility via URL params | Low |
| SDK bundle | Separate Vite build config for npm distribution | Medium |
| `IRenderingEngine` adapter | Isolate ThatOpen behind interface | Medium |

### Developer Experience (required for adoption)

| Component | Description | Complexity |
|-----------|-------------|-----------|
| API documentation | OpenAPI 3.0 spec + hosted docs (Stoplight, Redoc) | Medium |
| SDK reference docs | TypeDoc-generated from your TypeScript interfaces | Low |
| Quickstart guides | "Add a wall in 5 minutes" tutorial per customer type | Medium |
| Sandbox environment | Free-tier API key with test project for developers | Low |
| Changelog + versioning | API version in URL (`/api/v1/`) from day one | Low |

---

## Part 8: Business Model for B2B

### API Pricing Tiers

| Tier | Price | Limits | Target |
|------|-------|--------|--------|
| Developer | Free | 500 API calls/month, 1 project | Evaluation |
| Starter | £299/month | 10k calls/month, 5 projects, IFC export | Furniture SMEs |
| Professional | £999/month | 50k calls/month, unlimited projects, webhooks | Design platforms |
| Enterprise | Custom | Unlimited, SLA, on-prem option | Large architecture firms |

Your PlanConfig.ts already has `hasAPIAccess: true` on `firm` and `enterprise` plans —
the infrastructure for this gating is already there.

### SDK Pricing Tiers

| Tier | Price | What They Get |
|------|-------|---------------|
| Embed | £499/month | Iframe embed, postMessage API, PRYZM branding |
| White Label | £1,499/month | Iframe + custom branding, custom tools |
| SDK License | £2,999/month | npm SDK, can embed in their own app |
| OEM | Custom | Remove all PRYZM branding, resell as their own |

---

## Part 9: Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| API customer reverse-engineers IFC export | Low | Medium | Move IFC export server-side |
| ThatOpen changes license | Medium | Medium | Adapter pattern before SDK launch |
| API versioning breaks customers | High | High | Version in URL from day one (`/v1/`); deprecation notice policy |
| Fragment format incompatibility with SDK | Medium | Medium | Adapter pattern isolates this |
| Competitor clones API | Low | Low | Speed of iteration + trust/brand moat |
| Security: API key leak | Medium | High | Short-lived tokens, key rotation, rate limiting |
| Plugin sandbox escape | Low | High | Web Worker isolation; server validates all mutations |

---

## Part 10: What to Do This Week

1. **Decide on the two highest-value customer types** from Part 2 above.
   Different customer types need different API shapes. Don't try to build all of them
   at once.

2. **Define the API surface for Phase 1** — which element CRUD operations matter most
   to your first B2B target. For furniture companies: probably `createFurniture`,
   `updateFurniture`, `deleteFurniture`, `exportIFC`. For architects: full element CRUD.

3. **Register an API key table in Supabase** — this is one SQL migration and two
   Express middleware functions. It can be done in a day.

4. **Write an OpenAPI spec before writing any code** — define the B2B API contract
   in YAML first. This forces you to think about naming, versioning, and the shape
   of responses before committing to implementation.

5. **Do NOT start the ThatOpen decoupling yet** — wait until Phase 2 (SDK) forces it.
   The iframe embed works perfectly with ThatOpen as-is.

---

## Summary

| Question | Answer |
|----------|--------|
| Should I create an API? | Yes. Start with REST. Add iframe embed. SDK later. |
| Will my code be exposed? | No, if business logic stays server-side. |
| Should I decouple from ThatOpen? | Not now. Isolate it before SDK launch. Not a full rewrite. |
| Should I go vanilla Three.js? | Only if ThatOpen becomes a concrete problem. Not a strategic priority now. |
| What's the fastest path to B2B revenue? | REST API + iframe embed (Phase 1). 4–6 weeks of work. |
| What's the highest-value B2B play? | SDK (Phase 2) — lets companies embed your full editor. |
| What creates a developer ecosystem? | Plugin system (Phase 3) — the Figma play. |
| What already exists in PRYZM to support this? | API_ACCESS feature flag, rate limiter, Supabase, Clerk, EntitlementStore — all there. |
