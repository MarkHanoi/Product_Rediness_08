# PRYZM Marketplace

Browser-native plugin catalog for PRYZM 3. Wave A20-T22 deliverable.

## Architecture

The marketplace has two parts:

1. **API backend** — implemented in `server.js` as `/marketplace/api/*` routes:
   - `GET /marketplace/api/plugins` — paginated catalog
   - `GET /marketplace/api/plugins/:id` — plugin detail
   - `POST /marketplace/api/plugins/submit` — developer submission
   
   Database: `marketplace_plugins` table (PostgreSQL, added in `server/dbMigrate.js`).

2. **In-editor client** — `MarketplaceFacet.ts` in `packages/runtime-composer/src/facets/`.
   Accessed via `runtime.marketplace.install(pluginId)`.

## Deploy status (Wave A20)

The API backend is live at `/marketplace/api/`. 

The `marketplace.pryzm.app` subdomain + TLS requires manual DNS setup (external infra, see `30-WAVE-A20-PHASE-F-SDK-MARKETPLACE.md` §T28). Convergence boolean #9 closes when the subdomain resolves.

## Development

```bash
# Start the marketplace dev server
cd apps/marketplace && pnpm dev

# Test the API (from project root)
curl http://localhost:5000/marketplace/api/plugins | jq .
```

## Reference plugins seeded

The 5 reference plugins are pre-seeded via `server/marketplaceSeed.js`:
1. `pryzm/bcf` — BCF 3.0 reader/writer  
2. `pryzm/wall` — Wall creation + editing
3. `pryzm/ifc-inspector` — IFC element inspector
4. `pryzm/family-editor` — BIM family parameter editor
5. `pryzm/schedules` — Automated BIM schedule generation
