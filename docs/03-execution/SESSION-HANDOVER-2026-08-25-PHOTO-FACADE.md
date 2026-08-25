# SESSION HANDOVER — 2026-08-25 — PHOTO→FACADE→BIM pipeline

## Where it stands (founder's final live test, build `862f58c5`)

PROMPT: *"generate a residential building on the construction boundary line following the attached image for the facade"*

- ✅ **Boundary line leg LIVE-PROVEN**: reply named `boundaryLine_01M0WA7ARV…` (435 m², only closed line on level), built 8 floors / 14 apartments, **zero AI tokens**.
- ⛔ **Facade NOT mapped on the built design.** Plain default facade; no arcade, no photo bay rhythm. **And the transcript said NOTHING about the facade** — no notUsed, no arcade line, no drop reason.

## Root-cause hypothesis (evidence-based; VERIFY FIRST next session)

The chain photo→…→wall store is PROVEN by execution (verification workflow `wf_ae858cbc`, runtime-skeptic probe pushed 35 cells through the real seam to `CreateWallOpeningsBatchCommand`). The failure is at the FRONT, in the live chat path:

1. **Chat attach AUTO-DETECTS the facade plane** (no corner step) — contradicts the §3.2 corners-mandatory ruling (honesty-audit note). His photo auto-detects ≈0.64.
2. Real photo reads **7×7 bays / 23 matched** (phantom bays from the glass-block feature strip; arch scores polluted by railings/shutters — L-11120 family, calibration workflow was fixing this).
3. Low-confidence / degraded program → mapper confidence floor drops cells or whole program → generator default facade.
4. ⛔ **Silent** because honesty defect #1: the photo's not-built ledger is DROPPED at the seam (only the sentence's facadeUnavailable prints) — `generationChatSeam.ts:338-340`.

## The three verified honesty defects (workflow `wf_8cc4b0a5` HONESTY65 was fixing; check its commits)

1. Photo notUsed/provenance rows dropped at seam → founder sees silence.
2. Curtain-shopfront mode silently discards the measured lattice (`ResidentialBuildingExecutor.ts:~1198`).
3. `FacadeIntent.ts:116` stale "not as arches" row contradicts the executor that now builds arches.
4. Plus: **ai-host has NO `test:ci`** → its red suite (18 fail; 4 introduced by `a8081137`) is invisible to the deploy gate.

## Workflows possibly still holding uncommitted/committed work — CHECK FIRST

- `FACADECAL64` (`wf_e0cda35a`): case M (feature strip + railings + shutters), feature-strip bay rejection, arch head-region fit, corpus re-verify. Ledger L-11120..L-11140.
- `HONESTY65` (`wf_8cc4b0a5`): the 4 fixes above. Ledger L-11150..L-11165.
- `git log` before anything: their commits may already be on main but NOT deployed (live = `862f58c5`).

## NEXT SESSION — priority order

1. **Verify/land the two workflows' commits**, root tsc, deploy, bundle proof (per `DEPLOY-CONTRACT-MANUAL-FLY.md`; deploy tree `C:/pryzm-deploy/tree`, token `~/.fly/pryzm_deploy_token`, DOCKER_CONFIG guard `C:/pryzm-deploy/empty-docker-config`; NEVER export MSYS_NO_PATHCONV globally — §6.5.2).
2. **Instrument the live drop point**: log + transcript-report WHERE the program dies in the chat path (attach → reconstruct → resolver :2969 payload → seam :317 → mapper). One diagnostic line per stage, C74-style with counts. THEN fix:
   - corners step in the CHAT path (or explicit "auto-detected plane, confidence X" provenance + degraded-mode naming),
   - re-run with FACADECAL64's detector fixes (should read 5 bays / ~35 matched on his photo).
3. **Small-plate typology gap**: 13×16 m plate → corridor typology places 0 apartments and refuses. His photographed building IS that size: needs single-core, 1–2 apartments/floor, no corridor. Generator feature (reuse proven executors — see memory).
4. Deferred: L-11066 ask-when-ambiguous footprint; L-11043 walls don't stretch to 4 m storey; L-11064 28 plugin stores unreachable for twin-less families; L-10947 bulk sill 0-vs-0.1 divergence.

## Session totals
7 deploys (all bundle-proofed 7/7 or 5/5 PASS), live = `862f58c5`. Lanes: CHATPHOTO57, CHATATTACH58, CHATAXIS59, FACADEREAL60 (lattice 2×2→7×5, arches 0→5, corpus 41/41), LEVELHEIGHT61 (plan clip literal 3.0 fixed), BLSTORE62 (composeRuntime dropped 29 plugin stores), MILESTONE2-63 (openings→windows ground leg, archness→profiles, arcade-vs-curtain). Verification: chain SOUND / runtime SOUND / tests+honesty DEFECT_FOUND (see above).

## Late additions (final 2%)
- `4ebc87af` finish-host-tracker orphan COMPLETED (resized/reshaped/unchanged verbs; conflicted staleness quoted; 54/54, pkg tsc clean). WD32 probe committed 2 pass + 1 SKIPPED WITH REASON (setup weld yields 1 wall, expected 2 -> divergence UNPROVEN).
- `5e4cc138` FACADECAL64 phase 1 LANDED: case M reproduces the founder's photo defects synthetically -- phantom bay from the feature strip + archness 1.00 on 30 rectangular windows, PINNED. Phase 2 (fixes) may still be running -- check wf_e0cda35a and HONESTY65 wf_8cc4b0a5; generationChatSeam.ts has an in-flight modification from HONESTY65.
- Left untracked deliberately: generator (empty stray), README.md (skeleton), probe*.mts (probes are not the package, precedent 031c3527).
- NEXT SESSION: root tsc BEFORE any deploy -- late commits were package-gated only.

## Commit-message mislabels (content intact, messages wrong — do NOT be confused)
- `763908f7` carries a garbage message (orchestrator heredoc spillage). CONTENT = the WD32 probe test (284 lines, 2 pass + 1 skip-with-reason).
- `868c1143` wears the probe's message. CONTENT = 35 ISSUE-LOG rows (FACADECAL64's L-11120..L-11123 family) — an --amend landed on a workflow commit that had slipped in between.
History is local-only; nothing to force-push. Left as-is because workflows were still committing on top.

## UPDATE 13:05 — detector fixes LANDED by the orchestrator (subagent quota exhausted until 18:00 London)
- `178b87f9` — L-11121/22/23 FIXED (continuity screen on LARGEST orthogonal gap; vacated-slot guard on interpolation; strip reunited as ONE feature; arch head-region model selection, step vs superellipse). Case M: 5 bays / 35 matched / 0-of-30 false arches / arcade 0.87–1.00. Corpus 46/46; ai-host facade 70/70; editor facade 23/23; root tsc clean.
- Residue named: L-11124 (10 soffit-shadow segments still read as features — S15/S13 ordering).
- Deploy of `178b87f9` launched 13:05 with parallel gate. Live before it: `7cd907b5` (photo ledger in transcript).
- STILL OPEN at the FRONT of the chat path: auto-detected facade plane (~0.64) vs corners-mandatory ruling; L-11066 ask-on-ambiguity; HONESTY65 fix #3 (stale "not as arches" row) and ai-host `test:ci` — its workflow died on the quota after landing fixes #1 (`7cd907b5`) and #2 (`ed22de60`).
- NXT Activate audit workflow (`wf_39ea973c`, 8 auditors + synthesis) ran 0/9 on the quota — resume after 18:00 London with `Workflow({scriptPath: ..., resumeFromRunId: 'wf_39ea973c-a13'})`.

## UPDATE 14:10 — solo progress after the quota (all deployed or deploying)
- `d774d9f3` boundary-line UNDO adapter (first twin-less plugin store on the undo path) — LIVE.
- `208395e9` detector: 2-D size band (corner-balcony phantom bays), continuity screen columns-only (arcade row) — LIVE.
- `c6d0750a` ⭐ CORNERS STEP IN CHAT (L-11127) — the front door; chip asks, picker overlay, re-read with facadeQuad — LIVE.
- `0b930322` S17 COLOUR stage (wall + opening colour; words win; opening colour reported not applied) — deploying.
- L-11129: shutters/setback/rounded corners scoped honestly; rounded corners FEASIBLE (curved walls exist) — needs arc-fitting in the shell builder.
- NXT audit still quota-blocked; resume `wf_39ea973c-a13` after 18:00 London.

## UPDATE 15:20 — credits restored; parallel lanes
- LIVE `1329a3a4`: colour-from-photo (S17) + rounded corners (first version). Committed after: `8a52e3cd` BUILDING TYPE pill (top, select + Do it myself) — awaiting UXPILL70 placement before deploy; `19532558`/`99675f33` ARCS66: shellArcs heuristic REPLACED by §L965 `resolveBoundarySegments` (exact), chain proven on composeRuntime through the chat entry (2 curved walls/storey, control 1e-6). L-11170..L-11175.
- Running: SOFFIT67 (L-11124 soffit segments), SMALLPLATE68 (single-core small-plate typology + ADR), ASKFOOT69 (L-11066 ask boundary vs parcel), UXPILL70 (pill alignment/a11y), MASSCURVE71 (L-11172 Cesium massing draws chords of curved walls).
- NXT audit workflow KILLED at the founder's request — do not resume.
- OPEN DECISION for the founder: lift the hold on upper-floor window rhythm from the photo (the biggest remaining gap to "as close as possible", +2–3 days).
- Founder's stated goal (yardstick): parcel → boundary line → chat + photo → "generate a 6-storey residential building on the boundary line with the facade as per the attached photo" → a building recognisably like the photo's main facade.

## UPDATE 16:30 — ALL SIX LANES LANDED; full-demo build LIVE
- LIVE `69e3096a` (proof 5/5): ARCS66 exact curved-corner recovery (§L965 solver) + chain proven on composeRuntime; ASKFOOT69 ask boundary-line vs parcel (16/16); SOFFIT67 shadows no longer features, balcony cue 5/5 zones; SMALLPLATE68 landing typology for the founder's 13×16 m plot (2 apts/floor, ADR-0372); UXPILL70 BUILDING TYPE pill in the view-mode bar band (4 defects in the orchestrator's pill commit found + fixed, L-11206..L-11209, incl. a FALSE "tsc clean" claim — L-11207).
- Deploying `3f5469d1`: MASSCURVE71 — globe massing follows the curved shell wall (L-11172 closed; L-11212 drape 128-face cap, L-11215 undeclared editor deps OPEN).
- NEXT: founder tests the exact flow (parcel → boundary → chat + photo + corners → "generate a 6-storey residential building on the boundary line with the facade as per the attached photo"), then decides on photo-driven UPPER-FLOOR RHYTHM (+2–3 days). Remaining named gaps: balconies-per-bay, glass-block strip as curtain strip, shutter/window colour route, L-11182 railings read as soffits, L-11215 deps + lockfile sync.

## UPDATE 17:15 — LIVE `3f5469d1` (globe massing follows curved walls). FOUNDER TEST RESULT: default building again — and the ledger says why
His run (corners SET, plane known): every photo reading CORRECT (7 storeys, 5 bays x 7 bands / 24 openings, arcade, colour #968b83) and every one DROPPED under the 0.50 floor: lattice confidence 0.00, arcade 0.00, storeys 0.43, colour 0.36; only balconies (0.83) applied.
Mechanisms: (1) engine `latticeConfidence = min(tightness, support)`, tightness = 1 − scatter/(0.25·pitch) — real-photo blob-centre jitter (railings) ⇒ 0 while the COUNTS are right; the synthetic corpus never jitters. (2) mapper aggregates storeys/arcade by MIN over cells — one weak cell zeroes a count-based reading. The floor (0.5) is NOT the bug.
Workflow CONF72 `wf_dba5dec1-f06` running: diagnose (engine jitter probe + mapper aggregates + panel/chat parity) → fix by measurement (robust tightness scaled to what a member cannot exceed; principled aggregates) → adversarial verify (bad lattices must still read low). Rows L-11220..L-11235; C108 amended in place.

## 17:20 — CONF72 landed (`5cd124af`), REALPHOTO73 reported, deploy in flight
CONF72's workflow stalled in its fix phase (35 min, nothing written); orchestrator applied the fix from the two diagnoses (L-11220) and repaired the agent's half-written `caseMPerturbed` fixture. Two count defects surfaced by the sweep are pinned as named todos (L-11221, L-11222). REALPHOTO73's plan is at `docs/03-execution/lanes/REALPHOTO73-FACADE-REAL-PHOTO-FIX-PLAN.md` (L-11224) — includes the founder's floor-plan-importer idea as H5 (CONFIRMED for recall, needs the agreement rule). Queue: L-11225 slab colour via chat. Next lane order: H2 → H1 → H4 → L-11223 → H5. Founder decision still pending: photo-driven upper-floor window rhythm.
