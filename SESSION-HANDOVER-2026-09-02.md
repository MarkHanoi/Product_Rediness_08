# SESSION HANDOVER — 2026-09-02 (the six-lane wrap)

**This document is the authority for resuming.** Paste it (or point the next session at it) and
continue. Everything verified is pushed: `origin/main = 94e0a3d3`. Production is LIVE at
`405e2156` (manual Fly deploy, bundle proof 6/6). ~36 commits banked this session.
Companion memory: `session-close-2026-09-02` in the project memory dir.

⛔ **THE ONE HARD BLOCKER (founder):** GitHub Actions is **BILLING-BLOCKED** (verbatim: *"recent
account payments have failed or your spending limit needs to be increased"*; repo is PRIVATE, so
~8 CI-hours of bakes consumed the limit). Fix: raise the spending limit (~$5–8 covers the rest)
or make the repo public. Until then: no CI bakes, no merge-publish, no CI deploys. Everything
else works, including the manual Fly deploy path.

---

## LANE 1 — PARCELS IN ALL EUROPE (+ parcel data)

**LIVE IN PRODUCTION today:** ~20 jurisdictions clickable with real cadastral data. This
session's deploy added **EE, LT, PL, LU, SE + Denmark's keyless DAWA leg** behind the new
national-jurisdiction resolver (`c5d0109c` + proxy legs in `405e2156`): bbox = pre-filter only,
point-in-polygon decides, borders refuse BY NAME with the rival + measured distance (1,500 m
tolerance = the dataset's own p95). Live-proven clicks: Tallinn `78401:114:0086` · Vilnius
`0101/0039:1406` · Suwałki `206301_1.0005.11523/3` · Copenhagen matrikel `7000q` (no key).
The annexation hole is closed (16 refusal-only neighbour polygons, L-12887); Murcia's
month-old misroute is fixed by Catastro-INE routing (`f8890547`, L-12893 — the founder's own
Churra parcel returns Murcia's signed rules again).

**Honest limits:** SE gated on a free Lantmäteriet credential; FI on `MML_API_KEY`; LU has no
sound parcel source (measured); sub-km enclaves (Baarle-Hertog/Büsingen) L-12892; the Oder/Torne
refusal bands convert only with official DEU/POL/FIN/SWE boundaries + a 16-licence audit.
**Next:** LV + Tier-2/3 adapters (HR/SI/GR/HU/RO/SK/BG) — the E7 sibling pattern is proven.
**Beyond Europe (assessed, committed `9a45a0bb`):** AU launchable on open data
(NSW→SA→ACT→VIC…, 'AU-SA' code, never 'SA'); ME = TR/IL/QA open now, GCC gated by name.

## LANE 2 — LoD200 CONTEXT BUILDINGS IN ALL EUROPE

**Code: 100% DONE.** All **25 whole-country region rows** committed (`5faa71ba`); the
loss-refusing staged-publish machinery committed and PROVEN in CI (`15e49e79` — a publish
missing a staged region refuses by name; tile-join merge proof GREEN on real archives);
§WATER-TILE-CAP fix `e11f05bc` (grouped DK+NL water exceeded one z8 sea tile — water/parks now
degrade like every other layer).

**Operational state:** **staged so far: SPAIN (national, measured heights) + LU + EE** in
`tiles-staging/` — the live map is untouched. The chain is PARKED at group 2/14 by the billing
block. **Resume:** after billing, run the scratchpad `stage-chain.sh` groups
`denmark,netherlands → paris,lyon,koln → newyork,sanfrancisco → riyadh,jeddah → portugal →
belgium → switzerland → italy → norway → sweden → finland → greatbritain → germany`
(⛔ bash's `GROUPS` is a readonly builtin — the script uses `REGION_GROUPS`). Then ONE
deliberate merge-publish with `expect=<full csv>`, bump `CONTEXT_TILESET_VERSION`, client
deploy — only then is whole-country context visible to users. Heights: ES/DK measured now;
CH is WIRE-not-build (L-12883); ~9 stamps owed (~1–3 days each); phase-2 countries after.

## LANE 3 — ENVELOPE IN ALL EUROPE

**The architecture is SETTLED** (read before ANY engine work):
`audit/envelope-architecture/2026-09-02/` — adversarial audit verdict **REVISE** (no constraint
graph, no kernel replacement, no third vocabulary — the one-engine pattern IS the shipped
architecture) + the 7-country × 12-construction **VALIDATION-MATRIX** (nothing breaks the
frozen model; exactly **2 kernel primitives + 3 schema seats** missing) + short on-screen brief
(artifact d5fb3ad9…).

**Shipped this session:** **Paris DRAWS under the founder's recorded signature**
(`0daa4c88`, §PARIS-SIGN-OFF — scribe-not-signatory, L-449) · FR national zone-identity
(GPU 3-rung ladder `35baaabd`) · PT zone-identity + the **gate-shut Porto pack** (17 cited
values `73f3e2e6`; founder signed 1+2 `aa344749`; **all 7 articles pinned dual-engine**
`eb63eeaf`; flip awaits ONLY the `fabricDerivedHeight` seat — pre-authorized, cite
§PORTO-SIGN-OFF) · ES rural SIU guard (`23890d56` — no_urbanizable → cited refusal, never an
estimate) · **NL courtyard overstate FIXED** (`37aec97a` — exactly 900 m² was drawn over a
courtyard; permanent gate arm added, 182 solves).

**CUT MID-FLIGHT (working tree holds their half-states — verify-then-commit via finisher
lanes, mtime discipline):** **K1** kernel primitives (inclined-plane tops — the 5-country
primitive — + polygon difference/holes, oracle-pinned) · **S1** schema seats (`datum`,
`height-proportional-offset`, `context-aggregate`; per-seat ADRs; exhaustive-switch closure;
partial files: `evaluateHeightProportionalOffset.ts`, `heightDatumResolver.ts`,
GeometricRule.ts edits) · **G1** never-overstate fixtures for LIVE routes (Paris draws
UN-WALKED — the 6/115 hole; DK; Madrid; partial: gate + dk corpus fixture edits).
**Then:** Porto flip · never-understate gate design · CH-first pack production on the E8 spine
(`8b3ffeb7` — table reader at 100% on its gold set; CH per-parcel legal chain is machine-readable).

## LANE 4 — GENERIC SYSTEM CREATOR / EDITOR (Component Editor)

**The vertical slice is COMPLETE AND HAS A UI.** Phase 4 (`0c90a2da`): a component **places,
resolves formulas (unit mismatches throw — first time in repo history), persists through the
real serializer, and RENDERS** (first-ever scene.mount caller; three hidden breaks fixed incl.
a second uncounted runtime). U0 catalogue seam (`d2a01f29`): definitionId resolves for real;
four unenforceables now refuse by name. **U1+U2 (`384e2b74`): component browser, click-to-place
on the furniture-flow idiom, and the property section mounting the real parameter table** —
type swap + instance overrides with refusals rendered in-panel, 8/8 through the real runtime.

**Next (the UIUX plan `audit/universal-component-editor/2026-09-02/UIUX-PLAN.md`):**
U3 definition-editor workspace (formula editing on the repaired D4 path; profile panel save) ·
U4 type catalog (⛔ no type-CRUD verbs exist — document-draft route) · U5 3-D per D2's split ·
U6 AI authoring (the 12 harvested verbs; the ADR-0324 envelope now reaches the bus) · U7 the
`Family*` retirements. Known debts: production-viewport mirror rows (D10 descope) · D3 metres
migration = ONE token + guard test · L-12882 (88 family-runtime tests not in CI).

## LANE 5 — PERFORMANCE (audit + fix)

**Measured at the real layers, fixed red-first, revert-proven (`7fa60a2b`):** creates were
sub-2 ms all along (the pipeline was never the problem); **1000-wall batch 285.7→68.3 ms
(4.2×)** via a spatial proximity index with a full-scan answer-preservation oracle; single
create 2.8×; the O(N²) per-dispatch tax memoised; ~1.8 s of profiled boot deferrals
(DataWorkbench lazy, AppTheme memo, viewpoint defer). **The enemy is BOOT**: empty project
click-to-usable ≈ 7.2 s, 300-wall startup ≈ 11.7 s cold — decomposed by the product's own
marks; warm is NOT faster than cold (unexplained, a real lead).
**PLANNED queue (owners named in `audit/perf/2026-09-02/`):** mirror batch bracket
(runtime-composer) · ProjectLoader replay batching · web-ifc off the boot graph · shader/
material sharing (~1.2 s) · riders **L-12894** (composition-root undo silently restores
nothing) + **L-12895** (disjoint door-type vocabularies keep a legacy command load-bearing).

## LANE 6 — FRANCE SPECIFIC SCENARIO

**The founder's build brief is captured verbatim** (`96cadcc4`,
`docs/04-reference/jurisdictions/fr/FR-MODULE-BUILD-BRIEF.md`) — determinism, no fabricated
values, per-parameter provenance, the three-slot solver, the H/2 fixed point, the R151-12
qualitative-rule hard gate, RNU as permanent refusal, COS abolished ("if your schema requires
FAR for yield, France is the bug"), **step 4 ships before extraction**.
**Phase 0 was DISPATCHED under the brief's own stop-and-report gate and was CUT by session
close** — resume lane FR-PHASE0: contract tests (§4.1 four assertions + DescribeFeatureType
diff), extract probing (GeoPackage = SQLite; no PostGIS on this box — scalar fill-rates via
node sqlite, spatial metrics sampled-or-deferred honestly), the full §2 table, ending with the
**NOMFIC fill verdict** that decides the extraction architecture. Report lands at
`docs/04-reference/jurisdictions/fr/findings/FR-PHASE0-REPORT.md`.
**Already-built FR machinery the module extends (never rivals):** the zone-identity ladder,
the signed Paris pack, paris/lyon BD TOPO context rows, the FR registry row.

---

## THE NEXT DEPLOY (whenever chosen — manual path works today)

Ships to users: Paris drawn envelopes · Murcia fix · SIU rural guard · FR/PT zone-named
refusals · NL courtyard honesty · the component UI · the perf fixes. Path:
`DEPLOY-CONTRACT-MANUAL-FLY.md` §6.9.7 (ninth execution — worktree `/c/pryzm-deploy/tree`,
token at `~/.fly/pryzm_deploy_token`, builder `fly-builder-solitary-glade-5537`, warm it,
rollback tag first, proof after `DEPLOY_RC`).

## FOUNDER CHECKLIST
1. **GitHub Actions billing** (the blocker) → then say "billing fixed" to relaunch the chain.
2. SE Lantmäteriet credential · FI MML key (converts two gated countries).
3. E8 curation ledger (20 rows) · a named human for the extraction gold set.
4. R2 is DONE ($10 cap set; ~$0.90/mo worst case).
