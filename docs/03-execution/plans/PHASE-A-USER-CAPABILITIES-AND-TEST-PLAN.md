# Phase A — User capabilities + test plan

> **Stamp**: 2026-06-02 · **Status**: LIVE (tracks the master execution tracker)
> **Authority**: [master-execution-tracker.md §3 Phase A](./master-execution-tracker.md)
> **Audience**: PM, founder, design partners, beta customers, sales.
>
> **Purpose**: a precise inventory of what a real user can DO, SEE, and TEST end-to-end when Phase A is complete. Each row maps a user-facing capability to (a) the tracker rows that ship it, (b) the surface the user touches, and (c) the testable verification — the click path + the success criterion.
>
> **What this is NOT**: this is not the master tracker (that is the engineering backlog with status). This is the customer-readable side of the same scope.

---

## §1 — The TL;DR shape of Phase A's user experience

When Phase A is GA-complete a user will:

1. **Sign up at pryzm.app**, pick a plan tier (Free-Trial → Solo → Studio → Mid-Firm → Enterprise) on a pricing page that is generated from the canonical entitlement registry (no marketing hand-edit). Their tier governs which typologies + outputs are available.
2. **Onboard via a conversational RAC chatbot** that asks role + project intent in plain language, then drops them into the editor with a pre-staged project (with a typology + brief inferred from the conversation).
3. **Define their SITE first** (this is the big PRYZM differentiator): type an address → see a cream/warm Cesium satellite basemap → draw a parcel polygon → on commit, automatic climate fetch (EPW or NOAA fallback), terrain DEM, and OSM context-building ingest. A Site Inspector right-panel shows lat/lon, true-north, CRS, area, FAR, setback compliance, climate summary.
4. **Generate an APARTMENT layout** from a brief (1-bed, 2-bed, master en-suite, open-plan kitchen, etc.). The system runs a deterministic offline engine first (D-TGL → D-CE → D-FLE → D-LE — walls, ceilings, furniture, lighting) and only escalates to a paid AI model when the user opts in. The output passes through a dimensional + topology validator gate (G1-G10 dimensional, A1-A8 topology) before showing the user.
5. **Edit + iterate** via the editor's tools (wall · door · window · slab · roof · stair · column · curtain-wall · furniture) using a single keyboard-shortcut surface documented in a `?`-launched cheat-sheet.
6. **Export** as IFC4X3 (BIM standard), PDF/A-3 vector (drawing), DXF (CAD), or GLB (visual). Outputs respect plan tier (IFC export at Solo+, Revit round-trip at Mid-Firm+, etc.).
7. **Discover + install plugins** from the PRYZM marketplace (browse → filter → install). The first 5 PRYZM-built plugins ship at Phase A: BCF · IFC-Export · DXF · Multiplayer · Cesium-bridge.
8. **Collaborate** in real-time multi-user editing (Studio+ tier) with presence cursors + comments.
9. **Get audited** — every AI-generated artefact carries a provenance trail (model + prompt + context-hash + cost + approval) viewable in an Inspect-tree tab. PII is redacted at the prompt boundary; the redaction itself is audited.
10. **See accessible UI** — every tool has a keyboard shortcut; the `?` cheat-sheet works platform-aware (⌘ on macOS · Ctrl on Windows/Linux); all text + controls hit WCAG 2.2 AA contrast.

---

## §2 — Capability matrix

| # | What the user does | Where in the product | Tracker row(s) | Status today | Test path |
|---|---|---|---|---|---|
| **1. Plan + pricing** |
| 1.1 | Read tier-by-tier feature comparison | `pryzm.app/pricing` | A.18.a · A.18.b | ✅ DONE | Visit `/pricing` → see 5 tiers × 30 feature gates rendered by Astro at build-time from `@pryzm/entitlements` |
| 1.2 | Pay + activate tier | Stripe checkout | (existing — pre-Phase A) | — | Sign up → pay → tier reflected in `userTier` resolver |
| 1.3 | Hit a gated feature on wrong tier | every gated tool | A.18.a (resolver) | ✅ DONE | `check('feature.sso-saml', 'studio')` returns `{ allowed: false, reason: 'tier-too-low', requiredTier: 'enterprise' }` |
| **2. Onboarding** |
| 2.1 | Conversational role + project intake | RAC chatbot (right-panel modal at first login) | A.5 (RAC chatbot) | ⚪ PLANNED | Type role → typology defaulted → brief captured |
| 2.2 | Land in editor with pre-staged project | Editor on first load | A.5 + A.4 (apartment pack) | 🟢 IN PROGRESS (apartment pack BRIDGE shipped A.4.a) | New session → C20 Building + Level auto-promoted; apartment ready for generate |
| **3. Site definition (THE Hektar-style flow)** |
| 3.1 | Type address → reverse-geocode to lat/lon | Site authoring panel | A.8.a | ⚪ PLANNED | Address input → OSM Nominatim primary, Mapbox secondary → bbox returned, map zooms |
| 3.2 | Cream-tinted Cesium satellite tile basemap | Site canvas | A.8.b | ⚪ PLANNED | Open Site mode → see warm-white satellite (not dark globe) |
| 3.3 | Draw parcel polygon (click vertices, double-click close) | Site canvas polygon tool | A.8.c | ⚪ PLANNED | Click → drag → double-click → boundary committed |
| 3.4 | Automatic climate + DEM + context-building ingest on commit | Behind the scenes | A.8.d | ⚪ PLANNED | Commit polygon → EPW (or NOAA fallback) loads → DEM rendered → OSM neighbours appear |
| 3.5 | Draw building footprint inside parcel | Site canvas footprint tool | A.8.e | ⚪ PLANNED | Second polygon → must stay inside parcel (containment + setback enforced) |
| 3.6 | See site analysis summary | Site Inspector right-panel | A.8.f | ⚪ PLANNED | Panel shows lat/lon · true-north · CRS · area · FAR · setback · climate summary · context-building count |
| 3.7 | Project.location ↔ Site.location migration | Legacy projects load → auto-promote | A.7.e.1 | ✅ DONE (L0) | Load v1 project → `promoteProjectLocationToSite()` runs synchronously → Site.location populated |
| 3.8 | Site write commands (parcel · footprint · context-buildings · climate-link · building-link) | Site editor commands | A.7.c (×13 commands) | ✅ DONE | Every site.* command in command bus runs cross-schema validation pre-commit |
| **4. Climate substrate** |
| 4.1 | Upload EPW file → ingest | Climate pane | A.10.b + A.10.e | ✅ DONE (L2 + L3) | Upload EPW → parses (9 + 10 field LOCATION) → 4 builders (monthly normals · wind rose · design temps · degree days) run |
| 4.2 | Auto-fetch NOAA normals on boundary commit | Background | A.10.e | ✅ DONE (L3) | EPW unavailable → NOAA fallback loads 12 monthlies for site centroid |
| 4.3 | View sun-path overlay (per-date) | Climate panel sun-path tab | A.11 | ⚪ PLANNED | Date slider → sun azimuth + elevation drawn on plan |
| 4.4 | View wind rose | Climate panel wind tab | A.11 | ⚪ PLANNED | 16-sector × 6-bin Beaufort rose rendered |
| 4.5 | View temp + humidity profile | Climate panel | A.11 | ⚪ PLANNED | Monthly normals charted |
| 4.6 | Solar samples for a date+time | Climate API | A.10.c | ✅ DONE | `climate.solarSample(lat, lon, utcIso)` returns SolarSample |
| **5. Typology + apartment generation** |
| 5.1 | Pick apartment typology (default), house, small-office | Typology picker | A.20 (C50 contract) + A.4 (apartment) + A.21 (house) + A.22 (office) | 🟢 IN PROGRESS (apartment shipped; house + office PLANNED) | Typology picker shows 3 cards (Apartment ✅, House ⚪, Office ⚪) |
| 5.2 | Specify program (bedrooms, bath, master en-suite, open-plan, room areas) | Apartment generate modal | A.4 (apartment pack) | ✅ DONE (modal dynamic) | Fill 7 program fields → preview shape |
| 5.3 | Generate options (offline deterministic OR AI) | Generate button | A.4 + apartment cognition | ✅ DONE | Click Generate → D-TGL runs offline → 3 options returned in modal |
| 5.4 | Approve + execute layout | Pick a card → Execute | A.4 + (existing apartment pack) | ✅ DONE | Approve → walls + doors + windows + room boundaries appear in editor |
| 5.5 | Auto-furnish rooms | After room detection | D-FLE engine | ✅ DONE | Furniture engine runs on `apartment.layout-executed` |
| 5.6 | Auto-place ceilings | After room detection | D-CE engine | ✅ DONE | Ceiling slabs auto-appear per room |
| 5.7 | Auto-place lighting | After ceiling | D-LE engine | ✅ DONE | Lighting positions auto-set |
| 5.8 | Per-room dimensional validation (G1-G6 + G9) | Behind generate | F-Sprint dims + A.37.α | 🟢 IN PROGRESS (G1-G6 + G9 shipped; G10 partial) | Layouts that fail G1 area / G2 width / G3 length / G4 aspect / G6 wall / G9 hierarchy get HARD-rejected or soft-penalised |
| 5.9 | Per-apartment topology validation (A1-A8) | Behind generate | F-Sprint topology | ✅ DONE | Mandatory · forbidden · acoustic · wet-cluster · sequencing all enforced |
| 5.10 | Validation errors surfaced in modal | Generate modal red badges | F-Sprint badges | ✅ DONE | Each violation maps to a labelled badge in the modal card |
| **6. Editor — daily-use tools** |
| 6.1 | Draw walls (4 wall modes) | Wall tool | (existing) | ✅ DONE | W key → wall tool → draw segments |
| 6.2 | Insert doors (host on wall) | Door tool | (existing) | ✅ DONE | D key → click wall → door inserted at offset |
| 6.3 | Insert windows | Window tool | (existing) | ✅ DONE | N key → click wall → window |
| 6.4 | Slab / roof / stair / column / curtain-wall | Tool palette | (existing) | ✅ DONE | Per tool's keyboard shortcut |
| 6.5 | Move · rotate · copy · paste · duplicate · delete | Edit toolbar | (existing) | ✅ DONE | M / Ctrl-R / Ctrl-C / Ctrl-V / Ctrl-D / Del |
| 6.6 | Undo / redo (ring-buffer ADR-051) | Cmd-Z / Cmd-Shift-Z | (existing) | ✅ DONE | Three-store undo unified; verified live for wall + curtain-wall + door |
| 6.7 | Multi-element selection + isolation | Selection bus | (existing) | ✅ DONE | Marquee → isolate (Ctrl-H) |
| 6.8 | Level navigation up + down | PgUp / PgDn | A.33.a | ✅ DONE (registry) — wiring incremental | Press PgUp → next level active |
| 6.9 | 2D ↔ 3D view toggle | View toolbar / `3` key | (existing) | ✅ DONE | 3 key → 3D camera |
| 6.10 | Split-view (plan + 3D simultaneously) | View menu / Ctrl-\ | (existing) | ✅ DONE | Toggle split → plan left, 3D right |
| **7. Keyboard surface (accessibility)** |
| 7.1 | View all keyboard shortcuts (`?` cheat-sheet) | `?` overlay | A.33.a (L2) + A.33.b (L5 PLANNED) | 🟢 IN PROGRESS | Shift-/ opens overlay — registry shipped (35 shortcuts in 7 categories); L5 UI PLANNED |
| 7.2 | Shortcuts render platform-aware | Cheat-sheet | A.33.a | ✅ DONE | macOS: ⌘ S · Windows/Linux: Ctrl+S |
| 7.3 | Every tool has a keyboard shortcut | Every tool | A.33 (CI guard PLANNED) | 🟢 IN PROGRESS | Registry + CI guard `check-keyboard-coverage.ts` |
| 7.4 | WCAG 2.2 AA contrast on every surface | All UI | A.32.α (static gate DONE) + A.32.β (Playwright dynamic gate PLANNED) + A.34.a + A.34.b (token registry DONE) | 🟢 IN PROGRESS | `pnpm run check:a11y-contrast` runs the static audit (17 pairs, 0 failing); E2E axe-core gate still pending |
| 7.5 | Screen-reader semantics on Inspect tree + property panel | All UI | (C43 ratification) | ⚪ PLANNED | VoiceOver narrates selected element + property change |
| **8. Output exports** |
| 8.1 | IFC4X3 export | File → Export → IFC | (existing — gap-fill A.25) | 🟢 IN PROGRESS (gap-fill PLANNED) | Click Export IFC → `.ifc` with Psets + classification + ownerHistory |
| 8.2 | Revit-flavour IFC4X3-RV export (Mid-Firm+) | Export menu | A.26 | ⚪ PLANNED | Round-trip into Revit preserves walls + openings + grids |
| 8.3 | PDF/A-3 vector export (Solo+) | Export menu | (existing — gap fill at A.M.x) | ✅ DONE | Vector PDF with embedded fonts + IFC sidecar |
| 8.4 | DXF export (Studio+) | Export menu | (existing) | ✅ DONE | Layered DXF with hatch + line-types |
| 8.5 | glTF / GLB export (Solo+) | Export menu | (existing) | ✅ DONE | glTF 2.0 file for Unreal / Unity |
| 8.6 | IFC nightly round-trip suite (10 reference projects) | CI dashboard | A.27 | ⚪ PLANNED | Internal — confirms exports keep round-tripping across releases |
| **9. Marketplace** |
| 9.1 | Browse plugins | Marketplace UI | A.15 + A.16 | ⚪ PLANNED | List + filter + detail + install button |
| 9.2 | Install 5 first-party plugins | Per-plugin | A.15 | ⚪ PLANNED | BCF · IFC-Export · DXF · Multiplayer · Cesium-bridge each have a marketplace listing |
| 9.3 | Browse + install family packs | Family marketplace | A.28 + A.29 | ⚪ PLANNED | 3 community-authored packs at launch (IKEA-style kitchen · UK doors · JIS windows) |
| 9.4 | Publish a plugin (Developer tier) | Developer dashboard | (existing — A.13 needs npm publish) | 🔴 BLOCKED (npm token + 2FA) | Submit signed `.plugin` + appear in marketplace within X minutes |
| **10. Collaboration (Studio+)** |
| 10.1 | Real-time co-edit (CRDT) | Editor multi-cursor | (existing — multiplayer plugin) | ✅ DONE | Two browser windows → both see live cursor + edits |
| 10.2 | Share link with optional expiry + password | Project menu | (existing) | ✅ DONE | Generate link → grant view access |
| **11. Provenance + audit (C23)** |
| 11.1 | View per-artefact provenance | Inspect tree → Provenance tab | A.31.a + A.31.b + A.31.c + A.31.d (DONE) + A.31.e (L5 UI PLANNED) | 🟢 IN PROGRESS | Click an AI-generated element → see model · prompt-hash · cost · approval status — backend is wired, UI surface pending |
| 11.2 | Export project audit log | Project → Audit | A.31.b (PLANNED) | ⚪ PLANNED | Download `.json` or `.pdf` per [C23 §1.8] |
| 11.3 | PII redaction at prompt boundary | Behind every AI call | (C23 §1.6 implementation PLANNED) | ⚪ PLANNED | Confidential fields stripped before upstream; redaction count audited |
| 11.4 | Reproduce a deterministic AI call | Audit → reproduce button | A.31.d (PLANNED) | ⚪ PLANNED | D-TGL artefact → re-run with `(contextHash, seed, workflowVersion)` → byte-identical output |
| **12. Cognition + intelligence (continuous)** |
| 12.1 | Catch architecturally-wrong layouts (master smaller than bedroom, kitchen > living, etc.) | Behind generate | A.37.α (H1-H6) | ✅ DONE (G9 hierarchy) | Layout flagged with soft penalty + reason text on each violation |
| 12.2 | 100 new rules added to L1-L4 cognition layers | Across cognition | A.37 (continuous Sprint 2-12) | 🟢 IN PROGRESS | 152 → 252 rule count target |
| 12.3 | Daylight rule-checker | Validation panel | A.37.β (L2 rule DONE) + A.38 (L5 UI PLANNED) | 🟢 IN PROGRESS | L2 rule: windowless master / bedroom / living / kitchen → HARD reject; aperture < 10 % floor area → SOFT. L5 panel pending. |
| 12.4 | Perceptual evaluator (corridor width · sightline · aspect) | Validation panel | A.39.a (corridor width L2 DONE) + A.39.b (sightline PLANNED) + A.39.c (L5 UI PLANNED) | 🟢 IN PROGRESS | Corridor width: < 0.80 m HARD reject, 0.80-1.00 m / 1.40-2.50 m SOFT, 1.00-1.40 m comfort band |
| **13. Reliability + DR** |
| 13.1 | Restore a deleted project (within 30 days) | Settings → Trash | A.35.a (RUNBOOK-ACCIDENTAL-DELETE) + persistence | ✅ DONE (runbook); UI partial | Self-service "Restore" button per project |
| 13.2 | Pay-tier-keyed cold backup retention (30 / 90 / 365 d) | Behind the scenes | A.35.a + (C48 implementation) | 🟢 IN PROGRESS | Backups encrypted-at-rest with KMS per [C48 §1.3] |
| 13.3 | Public status page with DR runbooks linked | Trust page | A.35.a (runbooks shipped) | 🟢 IN PROGRESS | Public surface for the 4 core runbooks (DB primary · regional outage · ransomware · accidental delete) — internal-only today |
| **14. Building hierarchy (BIM 3 substrate)** |
| 14.1 | See Site → Building → Level → Apartment → Room tree | Inspect panel | A.24 | ⚪ PLANNED | Tree mirrors data; clicking a Level isolates its elements |
| 14.2 | Add / remove / reorder levels | Building tools | A.23.c (level.* commands DONE) + L5 UI PLANNED | 🟢 IN PROGRESS | `level.create` · `level.delete` · `level.setActive` available; L5 UI PLANNED |
| 14.3 | Define apartments within a Building | Apartment tools | A.23.c (apartment.* commands DONE) + L5 UI PLANNED | 🟢 IN PROGRESS | Multi-apartment floor plate scope (see [multi-apartment brief](../../03_PRYZM3/...) ) starts here |
| **15. Brand + marketing** |
| 15.1 | Landing page at pryzm.app says "PRYZM" (not PRYZM 3) | Public site | A.17 + A.19 | 🟡 NEXT UP | Crawl marketing pages: only "PRYZM" appears |
| 15.2 | npm scope `@pryzm/sdk` + `@pryzm/headless` published | npm registry | A.12 + A.13 | 🔴 BLOCKED (npm token + 2FA) | `npm install @pryzm/sdk` works |
| 15.3 | DNS marketplace.pryzm.app | Browser | A.14 | 🟡 NEXT UP | Cloudflare DNS + TLS cert |
| 15.4 | First 50 paying customers | Sales | A.40 | ⚪ PLANNED (marketing-led) | $1500 MRR by Phase A close |

---

## §3 — How to verify "Phase A is done"

Phase A's exit criteria are in [roadmap-phase-1-alpha.md §1](./roadmap-phase-1-alpha.md). The user-facing verification adds:

### §3.1 — The 9 "real-user moments" — each must work end-to-end

1. **Free-trial signup** → can read pricing → pick a tier → land in editor with a Site-first project.
2. **Address → parcel → climate** — type "London" → click on a parcel → see UK climate data within 60 seconds.
3. **Generate-an-apartment** — describe a 2-bed apartment → see 3 deterministic options in 10 seconds → execute one → see walls + doors + furniture + ceiling + lighting in the editor.
4. **Edit a wall** — pick a wall → drag an endpoint → IFC export still validates.
5. **Export IFC** — File → Export → IFC → open the `.ifc` in BIMcollab / IfcConvert / Solibri → walls + spaces + Psets present.
6. **Install a plugin** — open marketplace → find DXF → install → use DXF export.
7. **Co-edit with a teammate** — share link → second user joins → both see live cursors + commits.
8. **Audit an AI call** — Inspect tree → Provenance tab → click an AI-generated element → see model, prompt hash, cost.
9. **Accessibility** — Tab through every tool with keyboard → cheat-sheet (`?`) opens → axe-core CI green.

### §3.2 — Internal "we believe this" — testable

| Believer | Test |
|---|---|
| Pricing copy is generated, never hand-edited | grep `apps/docs-site/src/pages/pricing.astro` — only `buildPricingPageData()` consumed; no string literals |
| Every AI call writes a provenance row | `check-ai-records-artefact.ts` CI gate (C23 §6.1) green |
| DR runbooks executable | Q3 2026 DR drill passes |
| WCAG 2.2 AA across all UI | axe-core CI 0 critical / 0 serious |
| Keyboard surface complete | `check-keyboard-coverage.ts` CI guard green |
| File-format v1→v2 promotion lossless on the 5 v1 fields | `promoteProjectLocationToSite()` round-trip with v2-only nulls is bijective |
| Single Building per project (today) | `building.create` rejects second-Building until C20.1 amendment |

---

## §4 — Living document

Update this file when:
- A row's status flips (⚪ → 🟢 → ✅).
- A new user-facing capability is added to the tracker.
- The verification path changes (e.g. a test command moves).

Keep one PR per status flip — the master tracker + this file should always agree on what the user can do today.

---

## §5 — Cross-references

- Engineering backlog: [master-execution-tracker.md §3](./master-execution-tracker.md)
- Roadmap exit criteria: [roadmap-phase-1-alpha.md §1](./roadmap-phase-1-alpha.md)
- Contracts that govern each capability: index at [docs/02-decisions/contracts/README.md](../../02-decisions/contracts/README.md)
- DR runbooks: [docs/04-reference/runbooks/README.md](../../04-reference/runbooks/README.md)
- Memory + session log: see the user's auto-memory MEMORY.md
