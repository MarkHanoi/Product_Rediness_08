# PRYZM — B2B Implementation Plan
## Two Commercial Streams + Existing SaaS

**Date:** 2026-03-18  
**Type:** Detailed implementation plan — no code changes  
**Streams:**
- **Stream A** — Catalog Embed (Kave Home style): furniture & product companies
- **Stream B** — White-Label BIM (interior design companies' own Revit)
- **Core** — Existing PRYZM subscription SaaS (unchanged, running in parallel)

---

## 0. Context: What You Already Have Built

Before the plan, here's an inventory of what already exists that directly supports this:

### Already Built (No Work Needed)
| Asset | Location | B2B Relevance |
|-------|----------|--------------|
| Plan gating system | `src/monetization/PlanConfig.ts` | `API_ACCESS` feature already defined |
| Entitlement engine | `src/monetization/EntitlementStore.ts` | Feature gate logic already written |
| Server auth middleware | `server.js` `authMiddleware` | JWT verification via Clerk already working |
| Export authorization | `server/exportGuard.js` | Server-side export tokens, single-use, time-limited |
| Rate limiting | `server/rateLimiter.js` | Global + AI-specific rate limits |
| Project persistence | `server.js` `/api/projects*` | Full CRUD + versions in Supabase already working |
| Project serialization | `src/core/persistence/ProjectSerializer.ts` | Full snapshot of all 12 element types |
| Project loading | `src/core/persistence/ProjectLoader.ts` | Replays command history from snapshot |
| Real-time collaboration | `server.js` Socket.io | Project rooms, cursor sharing already wired |
| Furniture system | `src/elements/furniture/` | 20+ furniture types, full builders |
| Command system | `src/commands/` | All 12 element CRUDs, undo/redo |

### Current Pricing (from `PlanConfig.ts`)
| Plan | Monthly | Annual | Key Limits |
|------|---------|--------|-----------|
| Free | $0 | $0 | 3 projects, 5 AI actions, no export |
| Architect | $59 | $590 | Unlimited projects, IFC/GLB/PDF export |
| Studio | $149 | $1,490 | Up to 8 seats, collaboration |
| Firm | $349 | $3,490 | Up to 25 seats, **API access**, SSO |
| Enterprise | Custom | Custom | Unlimited, all features |

The `API_ACCESS` feature flag already exists and is gated to `firm` tier and above.
This is the peg the B2B billing hangs on.

---

## Part 1: The Three Revenue Channels (Overview)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PRYZM PLATFORM                                    │
│                                                                             │
│  ┌─────────────────┐   ┌──────────────────────┐   ┌───────────────────────┐│
│  │  PRYZM.io SaaS  │   │  STREAM A: Catalog   │   │  STREAM B: White-Label││
│  │  (Direct B2C)   │   │  Embed               │   │  BIM SDK              ││
│  │                 │   │  (Kave Home style)    │   │  (Interior Design     ││
│  │  Free → $349/mo │   │  £499–£2,999/mo       │   │   companies)          ││
│  │                 │   │  per company          │   │  £1,499–£4,999/mo     ││
│  └─────────────────┘   └──────────────────────┘   └───────────────────────┘│
│           │                        │                          │              │
│           └────────────────────────┴──────────────────────────┘             │
│                              SHARED ENGINE                                  │
│           Semantic Model + Commands + Builders + AI + IFC Export            │
└─────────────────────────────────────────────────────────────────────────────┘
```

All three channels run on the same backend. The B2B channels add a B2B control
plane (API keys, company accounts, catalog management) on top of the existing
server infrastructure.

---

## Part 2: Stream A — Catalog Embed (Kave Home Style)

### 2.1 What This Actually Is

A furniture company like Kave Home, Zara Home, or IKEA embeds a room design
experience inside their website. Their end users (shoppers) open a room planner,
see only Kave's furniture, design a room, and either save a design or proceed to
checkout with the exact items they placed.

**From the shopper's perspective:** "I'm on kavehome.com, I can design my living
room with Kave furniture, see it in 3D, and buy it."

**From Kave's perspective:** "We licensed a BIM engine we didn't have to build,
white-labeled it, and it shows our catalog."

**From your perspective:** Monthly recurring license to Kave. Optional: a small
commission per project saved (for premium analytics).

### 2.2 What Kave Gets Technically

1. An `<iframe>` embed or a JavaScript snippet they paste into their site
2. The PRYZM room designer appears, pre-loaded with Kave's product catalog
3. Their branding (logo, colors, font) applied via a config object
4. Their products appear as the furniture library (not PRYZM's generic ones)
5. Export: shareable link, screenshot (PNG), optionally PDF quote sheet
6. A webhook that fires when a user saves a design (so Kave can show the cart)
7. A dashboard where Kave manages their catalog, views analytics

### 2.3 How It Works Technically

**Step 1: Company Onboarding**
Kave creates a PRYZM Partner account. They get:
- A `partner_id` (e.g. `kavehome`)
- An API key for catalog management
- A configuration dashboard

**Step 2: Catalog Upload**
Kave uploads their product catalog via a REST API or a CSV/JSON import:
```json
POST /api/v1/partner/catalog/products
{
  "partnerId": "kavehome",
  "products": [
    {
      "id": "KH-SOFA-001",
      "name": "Lörn 3-Seat Sofa",
      "category": "sofa",
      "pryzmFurnitureType": "corner_sofa",
      "width": 2.8,
      "depth": 1.6,
      "height": 0.82,
      "price": 1299.00,
      "currency": "EUR",
      "modelUrl": "https://kavehome.com/models/lorn-sofa.glb",
      "thumbnailUrl": "https://kavehome.com/images/lorn-sofa.jpg",
      "colors": ["#FFFFFF", "#C8A882", "#2D2D2D"],
      "productPageUrl": "https://kavehome.com/sofa/lorn"
    }
  ]
}
```

**Step 3: Embed Configuration**
Kave adds this to their website:
```html
<!-- On kavehome.com -->
<div id="pryzm-room-designer" style="width:100%; height:700px;"></div>
<script src="https://embed.pryzm.io/loader.js"></script>
<script>
  PRYZM.init({
    container: '#pryzm-room-designer',
    partnerId: 'kavehome',
    apiKey: 'pk_live_kavehome_xxxxx',
    theme: {
      primaryColor: '#E8441A',  // Kave's brand orange
      logoUrl: 'https://kavehome.com/logo.svg',
      fontFamily: 'Söhne, sans-serif'
    },
    features: {
      showOnlyPartnerCatalog: true,  // Hide PRYZM generic furniture
      allowWalls: true,              // Let users define room boundaries
      allowSlabs: false,             // Not needed for room design
      allowExportIFC: false,         // Furniture companies don't need IFC
      allowExportPDF: true,          // Quote sheet PDF
      allowShare: true,              // Shareable link
    },
    onDesignSaved: (design) => {
      // Kave's own code: add items to cart
      KaveCart.addItems(design.products.map(p => ({
        sku: p.partnerId,
        qty: p.quantity
      })));
    }
  });
</script>
```

**Step 4: Product Placement in PRYZM**
When the user clicks "Add Furniture" in the embed, the furniture library shows
Kave's catalog instead of PRYZM's generic library. PRYZM maps Kave products to
the nearest matching `pryzmFurnitureType` for the 3D geometry.

**Step 5: Design Save + Webhook**
When the user saves their design:
- PRYZM persists the room design as a `ProjectSnapshot` under a guest session
- Fires a webhook to Kave's configured endpoint with the list of placed products
- Returns a shareable URL (`pryzm.io/r/kavehome/design/xyz123`)

### 2.4 What to Build for Stream A

#### New Database Tables (Supabase)
```sql
-- Company/partner accounts
CREATE TABLE partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,          -- e.g. 'kavehome'
  company_name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'catalog_starter',
  api_key TEXT UNIQUE NOT NULL,
  webhook_url TEXT,
  theme_config JSONB,
  feature_config JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Partner product catalog
CREATE TABLE partner_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES partners(id),
  external_id TEXT NOT NULL,          -- Kave's own product ID
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  pryzm_furniture_type TEXT NOT NULL, -- maps to FurnitureType enum
  width_m FLOAT,
  depth_m FLOAT,
  height_m FLOAT,
  price FLOAT,
  currency TEXT DEFAULT 'EUR',
  thumbnail_url TEXT,
  model_url TEXT,                     -- optional GLB for custom geometry
  product_page_url TEXT,
  color_options JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(partner_id, external_id)
);

-- Guest design sessions (no Clerk auth needed for shoppers)
CREATE TABLE partner_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES partners(id),
  session_token TEXT NOT NULL,        -- anonymous guest token
  snapshot JSONB NOT NULL,            -- full ProjectSnapshot
  placed_products JSONB NOT NULL,     -- [{external_id, name, qty, price}]
  share_token TEXT UNIQUE,
  webhook_fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- API usage for billing
CREATE TABLE partner_api_usage (
  partner_id UUID REFERENCES partners(id),
  period TEXT NOT NULL,               -- 'YYYY-MM'
  embed_sessions INT DEFAULT 0,       -- how many embed sessions started
  designs_saved INT DEFAULT 0,        -- how many designs saved
  webhook_calls INT DEFAULT 0,
  PRIMARY KEY (partner_id, period)
);
```

#### New Server Routes
```
POST /api/v1/partner/auth              — issue embed session token
GET  /api/v1/partner/:slug/catalog     — get partner's product catalog (public)
POST /api/v1/partner/catalog/products  — upload/sync products (API key auth)
POST /api/v1/partner/designs           — save a design (guest session)
GET  /api/v1/partner/designs/:shareToken — load a shared design
GET  /api/v1/embed/:slug/config        — return theme + feature config for embed
POST /api/v1/partner/webhooks/test     — test webhook endpoint
```

#### New Frontend: Embed Loader
A single lightweight JavaScript file (~20KB) served from `embed.pryzm.io`:
- `loader.js` — initializes the PRYZM iframe or in-page embed
- Reads partner config, applies theme, restricts tool visibility
- Handles postMessage bridge between the partner's site and PRYZM

#### New Frontend: Partner Dashboard
A separate web app (could be a new route `/partner` in the existing Express app):
- Catalog management (add/edit/delete products, bulk CSV import)
- Design analytics (how many designs, which products placed most often)
- Webhook configuration and testing
- Billing + API usage stats
- Brand customization (colors, logo, font, custom domain)

#### Existing Code Reuse
- `src/elements/furniture/FurnitureStore.ts` — extended to load catalog products
- `src/commands/furniture/CreateFurnitureCommand.ts` — unchanged
- `src/core/persistence/ProjectSerializer.ts` — unchanged, handles guest saves
- `server/exportGuard.js` — extended to allow PDF for catalog embed tier
- `src/monetization/PlanConfig.ts` — add `catalog_starter`, `catalog_pro` plans

### 2.5 Stream A: Pricing Model

| Tier | Price | What They Get |
|------|-------|--------------|
| Catalog Starter | £499/month | Up to 500 products, 1,000 embed sessions/month, PRYZM branding visible |
| Catalog Pro | £1,499/month | Unlimited products, 10,000 sessions/month, white-label branding |
| Catalog Enterprise | £2,999/month | Unlimited, custom domain, priority support, SLA |

**Revenue projection:** 10 furniture companies at Catalog Pro = £14,990/month =
£179,880/year from Stream A alone.

### 2.6 Stream A: Build Timeline

| Sprint | Duration | What Gets Built |
|--------|----------|----------------|
| 1 | Week 1–2 | Supabase tables + `/api/v1/partner/*` routes + API key middleware |
| 2 | Week 3–4 | Embed loader (`loader.js`) + iframe embed + postMessage bridge |
| 3 | Week 5–6 | Feature flag injection (hide tools per partner config) + theme config |
| 4 | Week 7–8 | Partner dashboard (catalog management, analytics) |
| 5 | Week 9–10 | Webhook system + design save + share links |
| 6 | Week 11–12 | Billing integration (Stripe) + usage metering + go-live |

**Total: ~12 weeks (3 months) to production-ready Stream A.**

---

## Part 3: Stream B — White-Label BIM (Interior Design Companies)

### 3.1 What This Actually Is

An interior design company (a 5–30 person studio, or a company building design
software for their designers) wants a full professional BIM authoring tool — but
without buying Revit at £2,500/seat/year and without the 6-month learning curve.

They license PRYZM as "their Revit" — under their own branding, configured for
their workflow, with their element templates and material library.

**Example customer:** A luxury interior design studio in Milan that wants all 20
of their designers working in one tool. They use PRYZM branded as "Milano Design
Studio — Design Platform." They pay £1,499/month for 20 seats.

**Second example:** A software startup that's building a tool for interior designers
and wants to embed a full 3D BIM editor without building the engine themselves.
They pay £2,999/month for the SDK license and ship it under their own brand.

### 3.2 Two Sub-Modes of Stream B

#### Sub-Mode B1: Managed White-Label (Hosted by PRYZM)
The easiest option for interior design studios. They get:
- A custom domain: `design.milanostudio.com` → points to your server
- Custom branding: their logo, colors, custom tool names
- Their own user base: their designers sign up, you manage accounts
- Element template library: pre-configured room types, material presets
- Admin dashboard: manage users, projects, billing

You run the server. They just use it under their brand.

#### Sub-Mode B2: SDK License (Self-Hosted or Embedded)
For companies building their own tools. They get:
- An npm package (`@pryzm/sdk`) — compiled, minified, source not exposed
- A JavaScript API to embed PRYZM in their own web app
- Their own backend (they call your API for BIM operations)
- Full control of UX around the PRYZM engine

This is for technical partners — startups building design tools.

### 3.3 What Interior Design Companies Get (Feature Set)

Unlike Stream A (furniture catalog only), Stream B customers get:
- Full wall, slab, column, stair, roof authoring
- Full furniture library + ability to add their own catalog
- IFC + GLB + PDF export
- Version history
- Real-time collaboration (multiple designers on one project)
- Their own material/finish library
- AI design advisor (configured to their style guidelines)
- Floor plan view + section cuts
- Custom element templates (e.g. "Italian Modern Kitchen" preset)

### 3.4 How Stream B Works Technically

#### For B1 (Managed White-Label):

**Step 1: Company Onboarding**
The studio's admin creates a partner account. Provides:
- Company name, logo, brand colors
- Custom domain (e.g. `design.milanostudio.com`)
- Seat count (e.g. 20 designers)
- Admin email(s)

**Step 2: DNS + Subdomain**
You add a DNS CNAME entry for `design.milanostudio.com → app.pryzm.io`.
Express serves the app with their branding based on the `Host` header.

**Step 3: User Management**
The studio admin invites their designers via your admin dashboard.
Each designer gets a Clerk account scoped to that partner's tenant.
You add a `partner_id` to the Clerk user metadata so all requests carry the tenant.

**Step 4: Running PRYZM Under Their Brand**
The same PRYZM app, but:
- Header reads "Milano Design Studio" not "PRYZM"
- Logo is theirs
- Any mention of "PRYZM" in UI is hidden behind a config flag
- Their custom element templates appear in the add menu
- Their material library is pre-loaded

**Step 5: Admin Dashboard**
A separate `/admin` route (partner-scoped) where the studio admin:
- Manages user seats (invite/remove designers)
- Views project analytics (projects created, elements used, export counts)
- Manages their custom element library
- Configures AI system prompt customization ("always recommend Italian marble finishes")
- Billing and invoicing

#### For B2 (SDK):

**What the SDK exposes:**
```typescript
import { PryzmEngine, PryzmViewer } from '@pryzm/sdk';

// Initialize the engine + viewport
const viewer = new PryzmViewer({
  container: document.getElementById('my-design-app'),
  apiKey: 'sk_live_...',           // Your PRYZM SDK key
  partnerId: 'designtool-xyz',
  projectId: 'proj-abc',           // Load existing project
  config: {
    theme: { primaryColor: '#2A5298' },
    features: {
      enableWalls: true,
      enableFurniture: true,
      enableAI: true,
      enableIFCExport: true,
    }
  }
});

await viewer.init();

// Call PRYZM operations programmatically
await viewer.createWall({ start: [0,0], end: [5,0], height: 2.7 });
const elements = await viewer.getElements({ type: 'wall' });
const ifcBytes = await viewer.exportIFC();

// Listen for events
viewer.on('elementCreated', (element) => { /* your code */ });
viewer.on('elementSelected', (element) => { /* update your own property panel */ });
viewer.on('projectSaved', (snapshot) => { /* save to your DB */ });
```

**How the SDK is protected:**
- Built with Vite in library mode: `build.lib` configuration
- `build.minify: 'terser'` with property mangling enabled
- No source maps in production build
- All API calls go to `api.pryzm.io` — the intelligence runs server-side
- API key is tied to a registered partner account (rate-limited, scoped)
- SDK license agreement (standard EULA): no decompilation, no redistribution

### 3.5 What to Build for Stream B

#### New Database Tables (Supabase)
```sql
-- Tenant configuration (one row per white-label customer)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,           -- e.g. 'milano-studio'
  company_name TEXT NOT NULL,
  custom_domain TEXT,                  -- 'design.milanostudio.com'
  plan TEXT NOT NULL DEFAULT 'b2b_managed',
  max_seats INT NOT NULL DEFAULT 5,
  theme_config JSONB,                  -- logo, colors, font
  feature_config JSONB,                -- which tools are enabled
  ai_system_prompt_override TEXT,      -- custom AI persona
  element_templates JSONB,             -- custom element presets
  material_library JSONB,              -- custom finish library
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tenant users (designers in the studio)
CREATE TABLE tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  clerk_user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'designer', -- 'admin' | 'designer' | 'viewer'
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(tenant_id, clerk_user_id)
);

-- Tenant API keys (for SDK customers)
CREATE TABLE tenant_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  key_hash TEXT UNIQUE NOT NULL,      -- bcrypt hash, never store plaintext
  key_prefix TEXT NOT NULL,           -- 'sk_live_xxx...' first 12 chars for display
  label TEXT,                         -- 'Production Key', 'Development Key'
  scopes TEXT[] NOT NULL DEFAULT '{}', -- ['read', 'write', 'export', 'admin']
  requests_this_month INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tenant usage for billing metering
CREATE TABLE tenant_usage (
  tenant_id UUID REFERENCES tenants(id),
  period TEXT NOT NULL,                -- 'YYYY-MM'
  active_users INT DEFAULT 0,
  projects_created INT DEFAULT 0,
  ai_actions INT DEFAULT 0,
  exports_ifc INT DEFAULT 0,
  exports_glb INT DEFAULT 0,
  exports_pdf INT DEFAULT 0,
  sdk_api_calls INT DEFAULT 0,
  PRIMARY KEY (tenant_id, period)
);
```

#### New Server Routes
```
GET  /api/v1/tenant/config             — return tenant config (from Host header)
GET  /api/v1/tenant/users              — list users (admin only)
POST /api/v1/tenant/users/invite       — invite a designer
DELETE /api/v1/tenant/users/:id        — remove a designer
GET  /api/v1/tenant/usage              — usage stats for billing dashboard

POST /api/v1/sdk/auth                  — exchange SDK key for session token
GET  /api/v1/sdk/projects              — list projects (SDK)
POST /api/v1/sdk/projects/:id/elements — create element (SDK, maps to command)
GET  /api/v1/sdk/projects/:id/elements — list elements (SDK)
PATCH /api/v1/sdk/projects/:id/elements/:eid — update element (SDK)
DELETE /api/v1/sdk/projects/:id/elements/:eid — delete element (SDK)
POST /api/v1/sdk/projects/:id/export/ifc — trigger IFC export (server-side)
POST /api/v1/sdk/projects/:id/export/glb — trigger GLB export
POST /api/v1/sdk/projects/:id/snapshot  — full project snapshot as JSON
```

#### New Frontend: Tenant-Aware App Rendering

The existing PRYZM frontend receives a `tenantConfig` object at load time
(from `GET /api/v1/tenant/config`) and conditionally:
- Renders the tenant's logo instead of PRYZM's
- Applies CSS custom properties for brand colors
- Shows/hides tools based on `feature_config`
- Loads the tenant's custom element templates
- Uses the tenant's custom AI system prompt override

**No separate frontend build needed** — the same app handles multi-tenancy through
a `TenantContext` object injected at boot time.

#### SDK Build

A separate Vite build configuration:
```typescript
// vite.sdk.config.ts
export default defineConfig({
  build: {
    lib: {
      entry: 'src/sdk/index.ts',     // Public SDK entry point
      name: 'PryzmSDK',
      formats: ['es', 'cjs'],
      fileName: (format) => `pryzm-sdk.${format}.js`
    },
    minify: 'terser',
    sourcemap: false,
    rollupOptions: {
      external: ['three'],           // Three.js is a peer dependency
    }
  }
});
```

The SDK entry point (`src/sdk/index.ts`) exports only the public API:
`PryzmViewer`, `PryzmEngine`, event types, and element type interfaces.
It does NOT export internal classes (stores, builders, commands).

### 3.6 Stream B: Pricing Model

#### Sub-Mode B1 (Managed White-Label)

| Tier | Price | Seats | What They Get |
|------|-------|-------|--------------|
| Studio White-Label | £1,499/month | Up to 10 | Full tool, PRYZM branding hidden, custom colors/logo |
| Firm White-Label | £2,999/month | Up to 30 | Full tool + custom domain + priority support |
| Enterprise White-Label | Custom | Unlimited | SLA, on-prem option, dedicated instance |

#### Sub-Mode B2 (SDK License)

| Tier | Price | API Calls | What They Get |
|------|-------|-----------|--------------|
| SDK Starter | £999/month | 10,000/month | npm package, iframe embed |
| SDK Professional | £2,499/month | 50,000/month | npm package + webhooks + custom element types |
| SDK Enterprise | Custom | Unlimited | Source adapter layer (still no raw source), dedicated SLA |

**Revenue projection:** 5 white-label studios at £1,499 + 2 SDK companies at £2,499 =
£12,493/month = £149,916/year from Stream B alone.

### 3.7 Stream B: Build Timeline

| Sprint | Duration | What Gets Built |
|--------|----------|----------------|
| 1 | Week 1–2 | Tenant DB tables + tenant config API + Host-header routing |
| 2 | Week 3–4 | Tenant-aware frontend (TenantContext, logo/theme injection) |
| 3 | Week 5–6 | Feature flag system (show/hide tools per tenant config) |
| 4 | Week 7–8 | Tenant user management (invite, roles, seat limits) |
| 5 | Week 9–10 | SDK API routes + SDK key auth + element CRUD via API |
| 6 | Week 11–12 | SDK build config + npm package + developer docs |
| 7 | Week 13–14 | Admin dashboard (tenant admin, usage, seat management) |
| 8 | Week 15–16 | Custom element templates + material library system |
| 9 | Week 17–18 | Billing metering + Stripe B2B invoicing + go-live |

**Total: ~18 weeks (4–5 months) to production-ready Stream B.**

---

## Part 4: Existing PRYZM SaaS (Core Channel — No Architecture Changes)

### 4.1 What Stays the Same
The existing `pryzm.io` direct subscription product changes very little:
- Free → Architect → Studio → Firm → Enterprise plan ladder stays
- Current pricing ($0 / $59 / $149 / $349 / custom) stays
- All existing features stay

### 4.2 What Changes (Small Additions)

**Add `partner_id: null` to all direct PRYZM users** so the system can distinguish
direct subscribers from white-label tenant users in the same Supabase tables.

**Move AI usage tracking from localStorage to Supabase** (currently in
`AIUsageTracker.ts` it's client-side localStorage — this is a security gap):
```sql
CREATE TABLE user_ai_usage (
  user_id TEXT NOT NULL,
  period TEXT NOT NULL,  -- 'YYYY-MM'
  count INT DEFAULT 0,
  PRIMARY KEY (user_id, period)
);
```

This is needed anyway for the B2B streams (no localStorage for API clients).

**Add a referral system** so that Stream B customers can generate referral links
for their designers to sign up for direct PRYZM accounts (cross-sell).

### 4.3 Pricing to Revisit

The current `firm` plan at $349/month includes `API_ACCESS`. Once the B2B SDK
exists, this is underpriced — a company accessing your API at $349/month when SDK
customers pay £999/month is arbitrage.

**Recommendation:** Keep `firm` at $349 but restrict API access to *personal use
only* (read-only API, project export only). Full write API access becomes
`API_ACCESS_WRITE` — gated to the B2B SDK tier.

---

## Part 5: Shared Infrastructure Changes

These must be built before either B2B stream can launch:

### 5.1 Server-Side AI Usage Tracking (Priority: High)

Currently `AIUsageTracker.ts` tracks AI usage in `localStorage`. This means:
- API clients (no browser) cannot be tracked
- Users can clear localStorage to reset their quota
- White-label tenants' usage can't be aggregated

**Fix:** Migrate to the `user_ai_usage` Supabase table above. The server's
`/api/anthropic/v1/messages` route already calls `enforceAIQuota()` in
`server/planStore.js` — extend that to write to Supabase.

### 5.2 API Key Infrastructure (Priority: High)

Build before any B2B launch. Components needed:

**Key generation:**
- Prefix: `pk_` (public/embed keys), `sk_` (secret/server-side keys)
- Format: `pk_live_[partnerId]_[32 random chars]`
- Storage: bcrypt hash stored in DB, plaintext shown ONCE at generation

**Key validation middleware:**
```javascript
// server/apiKeyMiddleware.js
export async function validateApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (!key) return res.status(401).json({ error: 'API key required' });
  
  const prefix = key.slice(0, 12);   // 'pk_live_kahe'
  const { data } = await supabase
    .from('tenant_api_keys')
    .select('*, tenants(*)')
    .eq('key_prefix', prefix)
    .single();
    
  if (!data || !bcrypt.compareSync(key, data.key_hash)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  req.tenant = data.tenants;
  req.apiKey = data;
  next();
}
```

### 5.3 Iframe Security (Priority: High)

The existing `securityHeaders.js` sets `X-Frame-Options: DENY` — this **blocks
the iframe embed entirely**. For the embed to work, this must change:

```javascript
// For /embed/* routes only:
res.setHeader('X-Frame-Options', 'ALLOWFROM https://kavehome.com');
// Or use CSP frame-ancestors instead (preferred):
res.setHeader('Content-Security-Policy', 
  `frame-ancestors 'self' ${allowedOrigins.join(' ')}`);
```

The `allowedOrigins` list comes from the partner's registered domains in Supabase.

### 5.4 IFC Export: Move to Server-Side (Priority: Medium)

Currently IFC export runs client-side (WebAssembly in the browser). For the API
(`POST /api/v1/sdk/projects/:id/export/ifc`), you need server-side IFC generation.

The export code in `src/export/ifc/` can run in Node.js — web-ifc supports Node.
Move the `IfcExporter` to a server route that:
1. Loads the ProjectSnapshot from Supabase
2. Runs the IFC pipeline server-side
3. Returns the `.ifc` file as a binary response or S3 download URL

This also fixes a security gap: the client currently runs the full IFC pipeline
locally. Moving it server-side means the IFC logic is never exposed.

### 5.5 CORS Policy for B2B Partners (Priority: High)

The existing `corsPolicy.js` reads `ALLOWED_ORIGIN` from env. For B2B partners,
origins need to be dynamic (each partner has different domains):

```javascript
// server/corsPolicy.js — extend for B2B
export function expressCorsOptions(tenantAllowedOrigins = []) {
  const staticAllowed = process.env.ALLOWED_ORIGIN?.split(',') ?? ['*'];
  const allAllowed = [...staticAllowed, ...tenantAllowedOrigins];
  
  return {
    origin: (origin, callback) => {
      if (!origin || allAllowed.includes('*') || allAllowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  };
}
```

Partner domains are loaded from Supabase at server startup and cached in memory
(refreshed every 5 minutes).

---

## Part 6: Developer Experience (Required for SDK Adoption)

No B2B SDK succeeds without excellent documentation. Build these before launch:

### 6.1 API Documentation
- **Format:** OpenAPI 3.0 YAML spec in `/docs/api/openapi.yaml`
- **Hosted:** Use Redoc or Stoplight Elements (free, self-hosted)
- **URL:** `developers.pryzm.io`
- **Sections:** Authentication, Partner (Stream A), SDK (Stream B), Webhooks

### 6.2 SDK Reference Docs
- TypeDoc from the SDK TypeScript types
- Auto-generated from `src/sdk/index.ts` exports

### 6.3 Code Examples (Critical for Adoption)
Four quickstart guides:
1. "Embed a furniture room planner on your website in 20 minutes" (Stream A)
2. "Create a wall, add furniture, export IFC in Node.js" (Stream B SDK)
3. "White-label PRYZM for your design studio" (Stream B managed)
4. "Receive webhooks when users save designs" (Stream A webhooks)

### 6.4 Sandbox Environment
- A `sandbox` partner/tenant account where developers can test freely
- API keys prefixed `pk_test_` / `sk_test_` → no billing, rate-limited to 100 req/day
- Same behavior as production

---

## Part 7: Parallel Development Strategy

You have three revenue channels running in parallel. Here's how to avoid
blocking yourself:

### 7.1 Sequencing (Recommended)

```
Month 1-2: Shared Infrastructure
  ├─ API key system
  ├─ Supabase schema for partners + tenants
  ├─ Server-side AI usage tracking
  └─ iframe CORS policy fix

Month 2-4: Stream A (Faster Revenue)
  ├─ Partner catalog API
  ├─ Embed loader + iframe
  ├─ Guest design sessions
  └─ Webhook system

Month 3-6: Stream B (Higher Revenue per Customer)
  ├─ Tenant-aware app rendering
  ├─ SDK API routes
  ├─ SDK build + npm package
  └─ Admin dashboard

Month 4+: Ongoing Core SaaS
  └─ Keep shipping PRYZM.io features
     (this attracts B2B leads organically)
```

### 7.2 Why Stream A First

- Smaller technical scope (catalog API + iframe, no full SDK)
- Faster sales cycle (furniture companies make faster decisions than architects)
- Proves the embed/API infrastructure before Stream B needs it
- Revenue from Stream A funds Stream B development

### 7.3 Isolation Principle

Keep the three channels' code isolated:
- Stream A code lives in `server/partner/` and `src/embed/`
- Stream B code lives in `server/tenant/` and `src/sdk/`
- Neither touches the core engine (`src/elements/`, `src/commands/`, etc.)
- Core SaaS changes are only in `src/monetization/` and `server/planStore.js`

---

## Part 8: Risk Register

| Risk | Stream | Probability | Impact | Mitigation |
|------|--------|------------|--------|-----------|
| Partner catalog format incompatibility | A | Medium | Medium | Define strict catalog JSON schema upfront; validate at upload |
| iframe blocked by partner's CSP | A | High | High | Document CSP requirements; provide CSP snippet |
| iframe blocked by PRYZM's own DENY policy | A | **Certain** | **Critical** | Fix `X-Frame-Options` before launch (see §5.3) |
| SDK decompilation by competitor | B | Low | Medium | Terser obfuscation + legal EULA; core logic server-side |
| White-label customer underuses seats | B | Medium | Low | Monitor monthly active users; report to them |
| Tenant A sees Tenant B's data | B | Low | **Critical** | Row-Level Security in Supabase; tenant_id on every query |
| AI usage tracking bypassed via localStorage | Core | High | Medium | Move to server-side (§5.1) — priority fix |
| API_ACCESS underpriced at $349 firm tier | Core | **Certain** | High | Reclassify firm API to read-only; full write API = SDK tier |
| Server-side IFC export too slow | B | Medium | Medium | Run in Node worker thread; return async (webhook + polling) |
| CORS origin whitelist not updated for new partners | A+B | Medium | High | Load from Supabase, refresh every 5 min, hot-reload |
| ThatOpen license change mid-SDK launch | B | Low | High | IRenderingEngine adapter (2-3 weeks), isolates the risk |

---

## Part 9: Complete File Change Map

Files to create (new):
```
server/partner/          — Stream A server routes
  partnerAuth.js
  catalogRoutes.js
  designRoutes.js
  webhookQueue.js

server/tenant/           — Stream B server routes
  tenantAuth.js
  tenantConfig.js
  tenantUserRoutes.js
  sdkElementRoutes.js
  sdkExportRoutes.js

server/apiKeyMiddleware.js    — Shared API key validation
server/tenantMiddleware.js    — Tenant resolution from Host header / API key

src/embed/               — Stream A frontend
  loader.ts              — embed initializer
  EmbedConfig.ts         — theme + feature types
  CatalogBridge.ts       — maps partner products to FurnitureType

src/sdk/                 — Stream B SDK public API
  index.ts               — public exports only
  PryzmViewer.ts         — embeddable viewer class
  PryzmEngine.ts         — headless engine (no viewport)
  types/                 — public TypeScript interfaces

src/tenant/              — Stream B frontend support
  TenantContext.ts       — tenant config state
  TenantProvider.tsx     — React context provider
  useTenant.ts           — hook for feature flags

vite.sdk.config.ts       — SDK build configuration
```

Files to modify (existing):
```
server.js                     — add partner + tenant + SDK routes
server/corsPolicy.js          — dynamic CORS for partner domains
server/securityHeaders.js     — conditionally allow X-Frame-Options for /embed/*
server/planStore.js           — migrate AI quota to Supabase
src/monetization/PlanConfig.ts — add catalog_starter, b2b_managed plan types
src/engine/EngineBootstrap.ts  — accept TenantContext; apply feature flags
src/ui/Layout.ts               — render tenant branding if TenantContext present
```

---

## Part 10: What to Do This Week (Immediate Actions)

### Day 1–2: Database Schema
Write the Supabase migrations for `partners`, `partner_products`, `partner_designs`,
`tenants`, `tenant_users`, `tenant_api_keys`, `tenant_usage`, `user_ai_usage`.
This is pure SQL — no code risk — and unblocks everything else.

### Day 3: Fix the iframe Blocker
Change `server/securityHeaders.js` to allow `X-Frame-Options` per-route.
Without this fix, Stream A cannot launch. Single file change, low risk.

### Day 4–5: API Key Middleware
Write `server/apiKeyMiddleware.js`. This is the foundation of all B2B auth.
Every subsequent API route uses it. Test it manually with Postman.

### Week 2: First Catalog API Route
Build `POST /api/v1/partner/catalog/products` and `GET /api/v1/partner/:slug/catalog`.
Test with a mock "Kave Home" partner in Supabase. This is the first working piece
of Stream A that you can demo to potential furniture company customers.

### Week 3: Simple Embed Demo
Build a minimal `loader.js` that embeds the PRYZM furniture tool in an HTML page
with a partner API key. This is your sales demo for Kave Home-style meetings.

**The embed demo is your most powerful sales tool. Build it early.**

---

## Summary Table

| Dimension | Stream A (Catalog Embed) | Stream B (White-Label BIM) | Core SaaS |
|-----------|------------------------|---------------------------|-----------|
| Target customer | Furniture companies | Interior design studios + tool builders | Architects, designers |
| Revenue model | £499–£2,999/month per company | £999–£4,999/month per company | $0–$349+/month per user |
| Build time | 12 weeks | 18 weeks | Ongoing |
| Code exposure risk | None (iframe) | Low (SDK minified) | None |
| ThatOpen dependency | Invisible to customers | Needs adapter before SDK | No change |
| Priority | **Build first** | Build second | No architecture change |
| Existing assets used | FurnitureStore, ProjectSerializer, exportGuard, Supabase | All of above + commands, tenant routing | All existing |
| First revenue possible | Month 3 | Month 5–6 | Already live |
