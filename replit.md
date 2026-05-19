# PRYZM BIM Platform
A monorepo-based BIM SaaS platform providing a 3D editor, real-time collaboration, and AI-assisted design.

## Run & Operate
```bash
npm run dev   # Starts Express + Vite dev server on port 5000
```
**Required Environment Variables:**
`DATABASE_URL`, `SESSION_SECRET`, `CF_WORKER_URL` (or `ANTHROPIC_API_KEY`), `PRYZM_OWNER_EMAIL`, `PRYZM_OWNER_PASSWORD`. Optional: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`.

## Stack
- **Frameworks**: React 19, Express.js
- **Runtime**: Node.js (pnpm@10.26.1)
- **Bundler**: Vite 7
- **Database**: PostgreSQL (Replit PostgreSQL, optional Supabase fallback)
- **ORM**: _Populate as you build_
- **Validation**: _Populate as you build_

## Where things live
- `/server.js`: Main Express + Vite dev server entry point.
- `/server/`: Backend modules (auth, DB, routes, services).
- `/src/`: Frontend SPA source (TypeScript, React).
- `/apps/`: Workspace applications (editor, ai-worker, sync-server, marketplace, docs-site).
- `/packages/`: Shared internal libraries (`@pryzm/*`).
- `/plugins/`: Feature plugins (e.g., `wall`, `ifc-inspector`).
- `/public/`: Static assets (3D items catalog, WASM files).
- `/index.html`: SPA entry point.
- `/vite.config.ts`: Vite configuration.
- **DB Schema**: `server/dbMigrate.js` (applied on startup).
- **Plugin Manifest Schema**: Referenced in ADR-0038, implemented in `@pryzm/plugin-sdk`.
- **API Contracts**: `/marketplace/api/plugins` endpoints in `server.js`.
- **UI Styles**: `src/ui/styles/layout.css`, `apps/marketplace/src/styles.css`.

## Architecture decisions
- **Monorepo Management**: Uses `pnpm` workspaces for efficient dependency management and sharing of internal packages across applications and plugins.
- **Backend-for-Frontend (BFF)**: A single Express.js `server.js` acts as a BFF, handling authentication, data APIs, file storage, AI proxying, and WebSocket communication, decoupling frontend from direct external service interactions.
- **CRDT for Collaboration**: Employs Yjs for real-time collaborative editing, moving away from a Last-Write-Wins (LWW) approach to enable robust 3-way merging and conflict resolution.
- **Plugin-driven Architecture**: Features are implemented as distinct plugins, discoverable via `PluginManifest` descriptors, allowing for extensibility and a marketplace.
- **Offline First with IndexedDB**: Utilizes IndexedDB for offline persistence, ensuring functionality and data access even without a network connection.
- **AI Pipeline Isolation**: The AI command batch pipeline is encapsulated within `packages/ai-host/`, providing a clear boundary for AI workflows, cost metering, and observability via OTel spans.
- **PRYZM4 Design System (Master-Foundation MIAW)**: Landing page and Project Hub use an animated CSS `@property` mesh-gradient background adapted from the Master-Foundation MIAW design system. Four violet-lavender blobs drift at different rates via `lp4-mesh-flow` (45 s). CSS custom properties `--lp4-b{1-4}{x,y}` (blob positions) and `--lp4-c{1-4}` (blob colours) are animated as `<percentage>` and `<color>` types, enabling smooth browser-interpolated gradient transitions (Chrome 85+, Firefox 128+, Safari 16.4+). The landing hero is full-screen centred: PRYZM pyramid logo → "Build the future, intelligently." bold heading → "BIM for teams who move fast." subtitle → "Start for free" + "See a demo" pill CTAs → feature tag strip. The Project Hub uses the same `@keyframes` at lower opacity, so white project cards remain the visual focus. The boot skeleton in `index.html` mirrors the gradient and centred layout for a seamless first-paint before the JS bundle resolves. Key files: `apps/editor/src/ui/styles/panels/marketingPages.ts` (gradient CSS + hero layout), `apps/editor/src/ui/platform/LandingPage.ts` (hero HTML), `apps/editor/src/ui/styles/panels/projectHub.ts` (hub gradient), `index.html` (boot skeleton).

## Product
- **3D BIM Editor**: Core functionality for creating and modifying BIM models.
- **Real-time Collaboration**: Users can co-edit models with real-time updates, cursor sharing, and presence awareness.
- **AI-assisted Design**: Features like AI-powered plan critique, design option generation, and voice commands.
- **IFC/Revit/DXF/Rhino Interoperability**: Comprehensive support for importing and exporting various industry-standard CAD/BIM file formats, including IFC4X3.
- **PWA Capabilities**: Installable as a Progressive Web App with offline support.
- **Plugin Marketplace**: A platform for discovering, installing, and submitting plugins to extend platform functionality.
- **Geospatial Precision**: Integration with `proj4js` for LTP-ENU geospatial coordinate transformations.

## User preferences
_Populate as you build_

## Gotchas
- **Supabase PostgreSQL on Replit**: Direct Supabase PostgreSQL connections (port 5432) are blocked on Replit; use the Supabase REST client instead.
- **Monorepo Inotify Limits**: Vite's watcher specifically excludes `node_modules` and the pnpm store to prevent exhausting inotify limits common in monorepo setups.
- **PWA Icon & Screenshot Requirements**: Ensure `public/icons/` contains `icon-192.png` and `icon-512.png`, and `public/screenshots/` contains `editor.png` (1920x1080) and `mobile.png` (390x844) for successful PWA installability and Lighthouse checks.

## Pointers
- **Plugin Manifest Schema**: Refer to ADR-0038 for the formal specification.
- **Headless Mode Documentation**: See `apps/docs-site/src/content/docs/headless/` for guides and API references on using the platform in headless environments.
- **AI Pipeline Tracing**: Detailed performance analysis for the "Create Curtain Walls" command can be found in `docs/03_PRYZM3/04-PLAN-FORWARD/40-CW-PIPELINE-TRACE.md`.
- **OpenTelemetry**: For details on observability and tracing, refer to OpenTelemetry documentation.
- **Yjs Documentation**: For information on CRDTs and collaborative editing, consult the Yjs official documentation.