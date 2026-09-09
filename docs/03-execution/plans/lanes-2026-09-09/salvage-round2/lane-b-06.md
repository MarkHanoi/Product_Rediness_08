{
  "defectId": "3d-site-surrounding-buildings-not-rendering-at-selected-parcel",
  "rootCauseFound": true,
  "rootCause": "The refusal is a SYMPTOM, not the cause, and its stated premise is false. On `site.location-changed` the ONLY context load fired in Forma mode is `CesiumViewport.ts:5103` — `void this.loadContextBuildings(anchor.lat, anchor.lon, true)` — where `anchor` comes from `resolveScopeAnchor` (`:5092-5099`) whose two candidates, `this.committedParcelLonLat` and `this.formaMassingOrigin`, are written ONLY inside `renderFormaMassing` (`:6979/:6991` and `:8209`) and therefore still hold the PREVIOUS site when this handler runs (the code says so itself at `:5081-5084`). `resolveScopeAnchor` decides \"is this the same site?\" with the SCOPE'S OWN RADIUS — default 1781 m (`contextExtentBudget.ts:330`), up to 7071 m (`:176`). A genuinely new parcel 1.1-1.3 km away is INSIDE that radius, so the stale candidate is ADOPTED and the load is aimed at the site the user just left. I ran the pure function at the founder's distance: at 1140.7 m with radius 1781 it returns `source=parcel-frame-origin`, i.e. the previous origin, verbatim note \"centred on the site frame origin (the parcel's first vertex)\". (Below ~1.15 m-scope it flips to `requested` = the raw address — the same defect through the other branch, which is literally \"THE PARCEL GOES OUT\" of its own plate.) That anchor then propagates to everything the founder sees: `contextBuildingsAt` (`:11991`), the globe cut/slab `applySiteScopeClip(lat, lon)` (`:11998`) and the far tier's own memo `contextFarTierState = { features: bounded, lat, lon }` (`:13352`). Meanwhile `renderFormaMassing` re-cuts the plate at the NEW parcel (`:8320`), which is why the picture is a plate centred on the parcel with the buildings sitting as an off-centre lobe 1.1 km away. When the terrain settles, `rebuildContextFarTierForBase` (`:13521`) compares that memo against `currentContextSite()` and refuses — CORRECTLY, given its input. Its premise, written at `:9971-9974` (\"a load for the current site is already in flight or imminent (every site change fires one)\"), is false in three reachable ways: (G1) `renderFormaMassing` is triggered by `site.parcel-boundary-set` and the four layout-executed events (`GISAreaLayout.ts:7032-7040`) and NEVER by `site.location-changed`, so a location change without a parcel commit (geocode box `siteGeocodeSearchBox.ts:162`, project-restore re-emit `siteDispatch.ts:1279`) has the mis-anchored load as its ONLY load; (G2) `liveUpdateFormaMassing` returns early at `GISAreaLayout.ts:6942` (generation in flight), `:6946` (Cesium unmounted) and `:6959` (`formaViewMode === 'map2d' && !site3dPaned`) — a parcel selected on the 2D map with no 3D pane runs no massing render at all; (G3) `maybeAttachTerrainProvider` re-enters `clampTerrainThenReplace(this.formaLastMassingInput)` at `:11178` and runs the whole reseat/refusal block with no context load beside it. Nothing anywhere verifies the premise, even though the exact handle exists and is unused: `contextLoadInFlight` (`:1632`).",
  "evidence": [
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 5103,
      "quote": "void this.loadContextBuildings(anchor.lat, anchor.lon, true);",
      "why": "The one and only context load fired by site.location-changed in Forma mode. Its anchor is resolveScopeAnchor's output, not the event location and not necessarily the current site. No sibling layer (roads/parks/water/landuse/rail/trees/street-life) is reloaded here at all."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 5096,
      "quote": "parcelRingLonLat: this.committedParcelLonLat,\n          frameOrigin: this.formaMassingOrigin",
      "why": "Both candidates are per-render memos written only inside renderFormaMassing (:6979/:6991 for committedParcelLonLat, :8209 for formaMassingOrigin), which has not run for the new site when this handler executes."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 5082,
      "quote": "On a real site change this event fires BEFORE `renderFormaMassing` re-seats `formaMassingOrigin` / `committedParcelLonLat`, so both still hold the PREVIOUS parcel; adopting them would rebuild every layer at the old site",
      "why": "The code states the hazard and then fails to prevent it: the guard it relies on is the scope radius, which is 1781-7071 m and therefore does not exclude a 1.1-1.3 km site move."
    },
    {
      "file": "apps/editor/src/ui/geospatial/scopeAnchor.ts",
      "line": 213,
      "quote": "if (sep > radius) {\n            // Record the FIRST rejection only ...\n            continue;\n        }\n        return { lat: c.at.lat, lon: c.at.lon, source: c.source, ...",
      "why": "Adoption is unconditional below the radius. MEASURED by running resolveScopeAnchor at the founder's separation (1140.7 m, radius 1781) -> 'parcel-frame-origin', i.e. the PREVIOUS site wins; at radius 900/500 it returns 'requested', i.e. the raw address wins. Both outcomes are wrong for a genuine site move."
    },
    {
      "file": "apps/editor/src/ui/geospatial/contextExtentBudget.ts",
      "line": 330,
      "quote": "const DEFAULT_SCOPE_RADIUS_M = 1781;",
      "why": "The 'same site' tolerance the handler passes. 1142.7 m (Madrid) and 1333.9 m (Cordoba) are both inside it, so both of the founder's events adopted a stale anchor. CTX_SCOPE_MAX_RADIUS_M = 7071 (:176) makes it worse as the founder widens the slider."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 9971,
      "quote": "When it is not, the primitive on screen belongs to somewhere else, a load for the current site is already in flight or imminent (every site change fires one), and the honest action is to REFUSE and let that load seat it.",
      "why": "The unverified premise. 'Every site change fires one' is true; that the one it fires is FOR THE CURRENT SITE is not, and nothing checks."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 13352,
      "quote": "this.contextFarTierState = { features: bounded, lat, lon };",
      "why": "The far tier stamps the LOAD anchor, so a load aimed at the previous site makes every later reseat compare a foreign anchor against the current one — the 1143 m in the founder's refusal line."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 11998,
      "quote": "void this.applySiteScopeClip(lat, lon);",
      "why": "The plate follows the LOAD anchor here, while renderFormaMassing cuts it at the PARCEL (:8320 'void this.applySiteScopeClip(originLat, originLon, { skipSide: true })'). Two owners of one centre is what produces 'parcel on bare ground, buildings elsewhere ON the plate'."
    },
    {
      "file": "apps/editor/src/ui/layout/GISAreaLayout.ts",
      "line": 6959,
      "quote": "if (formaViewMode === 'map2d' && !site3dPaned) return; // not looking at Cesium.",
      "why": "One of three early returns (with :6942 generation-in-flight and :6946 Cesium-unmounted) that stop renderFormaMassing from running on a parcel commit — so the mis-anchored load from site.location-changed becomes the ONLY load for that site change. The CesiumViewport subscriber is NOT gated by view mode and fires regardless."
    },
    {
      "file": "apps/editor/src/ui/layout/GISAreaLayout.ts",
      "line": 7032,
      "quote": "for (const evt of [\n            'site.parcel-boundary-set',\n            'site.zoning-updated',\n            'apartment.layout-executed',",
      "why": "site.location-changed is absent from the list that drives renderFormaMassing. A location change with no parcel commit (geocode box, project restore) therefore has NO successor load at all — the refusal-with-no-successor path."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 11178,
      "quote": "const input = this.formaLastMassingInput;\n      if (input) void this.clampTerrainThenReplace(input);",
      "why": "Second entry into the reseat/refusal block (from maybeAttachTerrainProvider), with no accompanying context load of any kind — the refusal here is guaranteed to have no successor."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 1632,
      "quote": "private contextLoadInFlight: { lat: number; lon: number; promise: Promise<void> } | null = null;",
      "why": "The verification handle the refusal needs already exists (written at :11842, joined at :11828) and is never consulted by reseatAnchorForCurrentSite."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 9956,
      "quote": "private currentContextSite(): { lat: number; lon: number } | null {\n    const o = this.formaMassingOrigin;",
      "why": "The 'current site' itself prefers a per-render memo. Its doc claims 'Both move with the site by construction' — false in exactly the window this defect lives in: formaMassingOrigin is written only at :8209, while the LTP-ENU origin readSiteLocation() reads (:4671, ltp ?? address) is rebased synchronously inside dispatchSiteLocation BEFORE the event is emitted (siteDispatch.ts:1526-1529 -> setLtpOriginIfSafe :1134)."
    },
    {
      "file": "apps/editor/src/ui/site/siteDispatch.ts",
      "line": 1140,
      "quote": "if (boundary && Array.isArray(boundary.polygon) && boundary.polygon.length >= 3) {\n            console.log('[gis] LTPENURebase.setOrigin SKIPPED — a parcel boundary is already committed; ...",
      "why": "This is the exact, already-available discriminator the radius test is failing to be: on a genuine site move the LTP origin HAS moved to the new point; on the post-commit address edit L-13086 exists for, it has NOT. Part 3 of the fix keys on it."
    }
  ],
  "proposedFix": "Three parts. Part 1 closes the brief's question; Part 3 removes the cause.\n\nPART 1 — make the refusal VERIFY, and rescue at the CURRENT site (never at `loadedAt`). In `reseatAnchorForCurrentSite` (CesiumViewport.ts:9979), before `return null`:\n```ts\nconst inflight = this.contextLoadInFlight;                       // :1632 — a REAL fact, not an assumption\nconst covered = !!inflight &&\n  originSeparationMeters(site, inflight) <= CesiumViewport.RESEAT_ANCHOR_TOLERANCE_M;\nconst key = `${site.lat.toFixed(6)},${site.lon.toFixed(6)}`;\nif (!covered && this.reseatRescueFiredAt !== key) {\n  this.reseatRescueFiredAt = key;                                // one shot per anchor: a settle loop cannot repeat it\n  console.warn(`[CTX-DIAG] ...and NO load for the current site is in flight (contextLoadInFlight=` +\n    `${inflight ? `${inflight.lat.toFixed(5)},${inflight.lon.toFixed(5)}` : 'none'}). Firing ONE at the CURRENT site.`);\n  void this.loadContextBuildings(site.lat, site.lon, true);\n  void this.loadContextTrees(site.lat, site.lon, true);\n  void this.loadStreetLife(site.lat, site.lon, true);\n}\nreturn null;   // still refuse to bake THIS primitive at the foreign anchor\n```\nWhy this cannot reintroduce L-12949: that fix force-loaded `loadedAt` — the REMEMBERED, foreign anchor. This loads `currentContextSite()`, which is DERIVED, so the old city is unreachable by construction rather than merely unlikely. And because it is the same (lat,lon) the correct load would use, the coalescer at :11828 joins an identical in-flight load and contextBuildings.ts's per-bbox cache answers a repeat with no network hop. Clear `reseatRescueFiredAt` in the project-switch teardown beside `this.contextLoadInFlight = null` (:18701).\n\nPART 2 — `currentContextSite()` (:9956) must read the LTP-ENU origin FIRST: `return this.readSiteLocation() ?? formaMassingOrigin`, inverting today's precedence. `formaMassingOrigin` is written only at :8209; the LTP origin is rebased inside `dispatchSiteLocation` BEFORE the event is emitted. Inverting makes both the refusal and the Part-1 rescue aim at the site the user is actually on during the window between the location dispatch and the next render — the window this defect lives in. Amend the field doc, which currently asserts the opposite.\n\nPART 3 — stop `resolveScopeAnchor` adopting a candidate the frame has already left. Add one input, `frameMovedTo` (the LTP-ENU origin from `getCurrentSiteOrigin()`, already imported in CesiumViewport), and reject any candidate further than `RESEAT_ANCHOR_TOLERANCE_M` (250 m) from it, BEFORE the radius test:\n- genuine site move (parcel reselect, new location before commit): `setLtpOriginIfSafe` rebased, LTP == requested, stale candidates are >250 m from it -> REJECTED -> the anchor is the LTP origin, i.e. the NEW parcel's frame origin (not the raw address either — this also closes the narrow-scope branch where `requested` wins);\n- post-commit address edit (the case L-13086 exists for): `setLtpOriginIfSafe` SKIPPED (siteDispatch.ts:1140), LTP still == the parcel, candidates co-located -> ADOPTED -> the parcel still beats the address. L-13086 preserved exactly, and its spec arms keep passing.\nThe scope radius stops being asked \"did the site move?\", a question it structurally cannot answer: 1143 m is inside a 1781 m slab and is still a different site.\n\nALSO WORTH A ROW (do not silently fold in): `site.location-changed` re-anchors ONLY the buildings (:5103). Roads, parks, water, landuse, rail, trees and street life are re-anchored only by `renderFormaMassing`, so on every path in G1/G2 those seven layers stay at the previous site even once the buildings move. Part 1 pulls trees and street life across; the five entity layers still need a decision.\n\nTESTS: extend `scopeAnchor.spec.ts` with a frame-moved case at 1143 m (must NOT adopt) beside the existing L-13086 post-commit case at the same distance (must adopt) — same distance, opposite verdicts, which is the whole point. Extend `CesiumViewportReseatAnchorCurrentSite.test.ts` with an arm where `contextLoadInFlight` is null/foreign and assert exactly one rescue load at `currentContextSite()` and never at `loadedAt`.",
  "confidence": "medium",
  "rivalHypothesesRuledOut": [
    "RULED OUT — 'the refusal itself is the bug; delete it and let the rebuild run.' The primitive it refuses to rebuild holds the PREVIOUS site's footprints (contextFarTierState carries its own features beside its own lat/lon, :13352), so rebuilding there re-asserts the old city — exactly L-12949, whose flip-flopping 57<->1006 canopy count the founder measured. The refusal is correct given its input; the input is wrong. This is why the fix rescues at currentContextSite() and still returns null.",
    "RULED OUT for the ordinary parcel-commit path — the brief's own hypothesis that a successor load starts and is then aborted with nothing behind it. `loadContextBuildingsUncoalesced` calls `this.contextBuildingsAbort?.abort()` at :11899 with NO `await` anywhere between the method entry (:11821) and that line, so the LAST caller always supersedes and the aborted one is always the EARLIER one. The founder's '[CTX-DIAG] context load ABORTED/superseded' line is therefore the STALE load dying — positive evidence that two loads with different anchors were in flight, not evidence of a lost successor. The no-successor paths are the three enumerated (G1 no parcel commit, G2 liveUpdateFormaMassing early returns at GISAreaLayout.ts:6942/6946/6959, G3 maybeAttachTerrainProvider re-entry at :11178), where there is no later caller at all.",
    "RULED OUT — 'only the far tier is stale; the near ring is at the parcel.' Both tiers come from ONE load and one anchor, and `clearContextBuildings()` drops near + far together (it calls clearContextFarTier and nulls contextFarTierState). A near ring at the parcel with a far tier 1.1 km away is not reachable from a single load, and the screenshot shows nothing around the parcel at all.",
    "RULED OUT — 'θ / project-north rotated the context.' `scopeClipperFor` (:2391) applies θ to the SCOPE polygon only; footprints are placed from their own lon/lat. A θ error rotates the plate edge (that is L-13264, 'buildings cut by diagonal lines', a separate and already-fixed defect) — it cannot translate every building by a uniform 1.1-1.3 km.",
    "RULED OUT — 'suppressNextLocationFly short-circuits the handler before the load (:5000).' `suppressNextSiteLocationFly()` (:19180) has ZERO callers anywhere in apps/editor — grep returns only the definition. That branch is dead.",
    "NOT RULED OUT — which BRANCH of resolveScopeAnchor fired in the founder's session. With the default 1781 m scope it adopts the stale previous origin; with a narrowed scope (<1.15 km) it keeps the raw address. Both put the context somewhere that is not the parcel and both produce the reported picture (the second one literally puts the parcel outside its own plate — 'THE PARCEL GOES OUT'). The fix closes both, but I could not observe his `§SITE-SCOPE-ANCHOR-IS-THE-PARCEL site.location-changed — <source>: <note>` line, which names it outright.",
    "NOT RULED OUT — whether the founder's specific session took a no-successor path (G1/G2/G3) or simply lost the race. I could not reproduce his session. The mis-anchored load at :5103 is established either way and is sufficient on its own for the transient wrong picture; the G-paths are what make it PERMANENT."
  ],
  "whatWouldFalsifyThis": "One console line from the founder's session kills this: `[CesiumViewport][forma] §SITE-SCOPE-ANCHOR-IS-THE-PARCEL site.location-changed — <source>: <note>` (CesiumViewport.ts:5100) whose adopted lat/lon EQUALS the newly selected parcel. Equivalently, `[CTX-DIAG] footprints fetched: near=… far=… for LAT … LON …` (:11957) printing the NEW parcel's coordinates on the load whose buildings are the ones actually drawn, while the far-tier refusal still fires — that would mean the load did go to the new site and the stale-anchor mechanism is not what he is looking at. Cheapest live probe: log `contextFarTierState.lat/lon`, `contextBuildingsAt`, `siteScopeClipAt` and `currentContextSite()` together at the moment of the refusal; if all four agree and the buildings are still displaced, this diagnosis is wrong and the fault is downstream in placement, not in the anchor.",
  "filesToChange": [
    "apps/editor/src/ui/geospatial/CesiumViewport.ts",
    "apps/editor/src/ui/geospatial/scopeAnchor.ts",
    "apps/editor/src/ui/geospatial/__tests__/scopeAnchor.spec.ts",
    "apps/editor/__tests__/CesiumViewportReseatAnchorCurrentSite.test.ts"
  ]
}