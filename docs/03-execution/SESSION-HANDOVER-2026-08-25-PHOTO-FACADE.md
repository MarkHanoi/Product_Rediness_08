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
