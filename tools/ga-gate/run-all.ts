#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/run-all.ts
 * @description Orchestrator for all PRYZM GA gate checks.
 *
 * Contract C01 §5 — all gates MUST pass before a PR merges.
 * Wave A14 (S118) — wired into .github/workflows/ci.yml as a single step.
 *
 * Gates run (in order, all must exit 0):
 *   1.  check-cast-count.ts                  — (window as any) ratchet (P4)
 *   2.  check-raf-count.ts                   — rAF owner ratchet (P3)
 *   3.  check-three-imports.ts               — THREE isolation (P2)
 *   4.  check-engine-bootstrap-loc.ts        — EngineBootstrap.ts deleted (P1)
 *   5.  check-l7-boundary.ts                 — no direct @pryzm/* in plugins (L7)
 *   6.  check-motion-gate-coverage.ts        — motion gate coverage (P8)
 *   7.  check-otel-spans.ts                  — handler OTel spans (S03/C10). Reading 2026-08-11:
 *                                              255/256 instrumented, HARD_FLOOR 213. This line
 *                                              said "184/184" — stale on BOTH halves: the count
 *                                              had moved, and the floor was never 1:1 with it.
 *                                              Do not restate a number here; run the gate.
 *   8.  check-ctrl-z-wired.ts               — Ctrl-Z ring-buffer wired (C03/Wave36)
 *   9.  check-project-isolation.ts           — C13 project-isolation anchors (Wave35)
 *   9b. check-declared-project-scopes.ts     — ADR-0298 declared isolation-probe set (C13 §3.10)
 *   10. check-no-commandmanager.ts           — cmdMgr alias + literal ratchet (OI-046 / Phase E.5.x)
 *   11. check-no-workspacemountbridge.ts     — workspace bridge (D.4) elimination (Phase 2 Task 2.2)
 *   12. check-per-package-compile.ts         — per-package tsc --noEmit (Phase H · C01 §5 · Task 7.2)
 *   13. check-scene-graph.ts                — NME proxy-in-scene tripwire (G2-T2/doc50)
 *   14. check-geometry-ceiling.ts           — releaseGroups disposeProxies ceiling (G1-T4/doc50)
 *   15. check-apps-editor-ghost-dirs.ts      — ghost directory guard (G7/doc50)
 *   16. check-window-store-in-packages.ts   — window.xStore reads in packages/ (OI-047 / Phase E.stores)
 *   17. check-custom-event-packages.ts      — CustomEvent dispatches in packages/ (OI-048 / Phase F.events)
 *   18. check-commandmanager-any.ts         — commandManager: any typed params (OI-049 / Phase E.types)
 *   19. check-structuredclone-new-commands.ts — structuredClone undo in command-registry (OI-050 / Phase E.undo)
 *   20. check-xss-guards.ts                 — repo-wide HTML-sink scan, per-file ratchet (P0/OI-051, L-407)
 *   21. check-custom-event-apps.ts          — CustomEvent dispatches in apps/editor/src/ (OI-050 / Phase F.events.2)
 *   22. check-zoning-fidelity-label.ts      — estimated zoning value never rendered authoritative (C58 §6 / ADR-0279 BLOCKER-1)
 *   23. check-height-fidelity.ts           — 3D-Site height honesty (L-646 / L-647)
 *   24. check-write-route-auth.ts          — every mutating Express route is authenticated or declared-exempt (C08 §1.2, L-406)
 *   25. check-command-naming.ts            — one domain, one command prefix spelling (L-796)
 *   26. check-layer-boundaries.ts          — THE layer gate; eslint-plugin-boundaries never was (L-809)
 *   27. check-single-compose.ts            — P1 single composition root (L-812, was MISSING)
 *   28. check-domain-purity.ts             — P5 schemas are pure (L-812, was MISSING)
 *   29. check-no-direct-store-writes.ts    — P6 commands are the only mutation path (L-812, was MISSING)
 *   30. check-visibility-intent-not-ui.ts  — P7 visibility intent ≠ UI (L-812, was MISSING)
 *   31. check-chat-capability-coverage.ts  — every registered bus command is declared to the chat (ADR-0313)
 *   33. check-batch-creation-coverage.ts   — C11 §4.2: live catalogue entries whose command
 *                                            loops over elements with NO batchCoordinator
 *                                            batch. A NAMED ledger of 4, not a count.
 *   32. check-report-payload-discard.ts    — R4: dispatch sites that discard an engine report
 *                                            payload (C68 §5.g). Target 0, and it IS 0 —
 *                                            not a ratchet. The engines were honest and the
 *                                            reporting layer printed "Done" over them.
 *
 * §P1/P5/P6/P7-UNENFORCED (L-812, 2026-08-09). C01 §5 listed gates 27–30 as
 * hard-fail and merge-blocking. **None of the four script files existed.** P6 in
 * particular — "commands are the only mutation path" — underpins undo, CRDT merge
 * and the AI batch-apply path, and nothing in this repository checked it. The
 * inventory described enforcement that was never written, and the only reason
 * that survived fifteen months is that nothing ever attempted to run it. See the
 * `missing` pre-flight below, which now makes that specific lie impossible.
 *
 * Phase 0 (OI-046 through OI-050): Gates 16–19 are the new gates added to close
 * the aliasing loophole and establish ratchets for all four remaining legacy patterns.
 * All four ratchets start at their 2026-05-16 baselines and decrease per Phase E/F sprint.
 * Gate 21 (F.events.2) extends the CustomEvent ratchet to the apps-tier (297 sites baseline).
 *
 * ─── §C9-GATE-SUITE-IS-HONEST (2026-08-11) ───────────────────────────────────
 * The numbered inventory above is a HISTORY, not a census — GATES below is the
 * authority, and a mismatch between the two is now impossible to hide: a file with
 * no row and a row with no file both fail this runner (see the two pre-flights).
 * Three defects were closed in the runner itself during that pass:
 *
 *   1. `check-report-payload-discard.ts` was registered TWICE, so every tally this
 *      runner printed counted one gate twice. Duplicate rows now fail loudly.
 *   2. `check-verb-liveness.ts` was COMMITTED and registered nowhere — authored,
 *      enforcing C16 §5.1 CA-21, and never once run. Committed-but-unregistered
 *      gates now fail; untracked ones are disclosed.
 *   3. `check-per-package-compile.ts` had never compiled a package on Windows and
 *      printed ~90 fabricated PASS lines per run (L-774 living inside a gate).
 *
 * Exit codes THIS RUNNER returns:
 *   0 — all gates passed, or every failure is declared debt at its declared level
 *   1 — a gate regressed, was misconfigured, or exceeded a shrink-only ratchet
 *
 * Exit codes THIS RUNNER READS FROM A GATE — three distinct facts, three codes.
 * Aliasing any of them onto 1 is how a gate's silence gets mistaken for consent:
 *   0 — clean
 *   1 — failed. Absorbable IF the gate is on gate-debt.json.
 *   2 — MISCONFIGURED; the gate could not evaluate its subject (§MISCONFIG-IS-
 *       NEVER-DEBT, L-811). NEVER absorbable — "I looked nowhere" and "I looked
 *       and it was clean" must never print the same.
 *   3 — a SHRINK-ONLY RATCHET WAS EXCEEDED (§RATCHET-EXCEEDED-IS-NEVER-DEBT, R7 /
 *       L-836). NEVER absorbable — the ledger declares that a gate FAILS, not that
 *       it may get WORSE.
 */

import { spawnSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

interface Gate {
  name: string;
  script: string;
}

const GATES: Gate[] = [
  { name: 'cast-count (P4)',                          script: 'check-cast-count.ts' },
  { name: 'raf-count (P3)',                           script: 'check-raf-count.ts' },
  { name: 'three-imports (P2)',                       script: 'check-three-imports.ts' },
  { name: 'engine-bootstrap-loc (P1)',                script: 'check-engine-bootstrap-loc.ts' },
  { name: 'l7-boundary (L7)',                         script: 'check-l7-boundary.ts' },
  { name: 'motion-gate-coverage (P8)',                script: 'check-motion-gate-coverage.ts' },
  { name: 'otel-spans (S03/C10)',                     script: 'check-otel-spans.ts' },
  { name: 'ctrl-z-wired (C03/Wave36)',                script: 'check-ctrl-z-wired.ts' },
  { name: 'project-isolation-gate (C13/Wave35)',      script: 'check-project-isolation.ts' },
  { name: 'declared-project-scopes (ADR-0298)',        script: 'check-declared-project-scopes.ts' },
  { name: 'no-commandmanager (OI-046/Phase E.5.x)',  script: 'check-no-commandmanager.ts' },
  { name: 'no-workspacemountbridge (Phase2/Task2.2)', script: 'check-no-workspacemountbridge.ts' },
  { name: 'per-package-compile (Phase H/Task7.2)',    script: 'check-per-package-compile.ts' },
  { name: 'scene-graph (G2-T2/doc50)',                script: 'check-scene-graph.ts' },
  { name: 'geometry-ceiling (G1-T4/doc50)',           script: 'check-geometry-ceiling.ts' },
  { name: 'apps-editor-ghost-dirs (G7/doc50)',        script: 'check-apps-editor-ghost-dirs.ts' },
  { name: 'window-store-in-packages (OI-047/E.stores)', script: 'check-window-store-in-packages.ts' },
  { name: 'custom-event-packages (OI-048/F.events)',  script: 'check-custom-event-packages.ts' },
  { name: 'commandmanager-any (OI-049/E.types)',      script: 'check-commandmanager-any.ts' },
  { name: 'structuredclone-commands (OI-050/E.undo)', script: 'check-structuredclone-new-commands.ts' },
  { name: 'xss-sink-scan (P0/OI-051/L-407)',          script: 'check-xss-guards.ts' },
  { name: 'custom-event-apps (OI-050/F.events.2)',    script: 'check-custom-event-apps.ts' },
  { name: 'zoning-fidelity-label (C58§6/ADR-0279)',   script: 'check-zoning-fidelity-label.ts' },
  { name: 'height-fidelity (L-646/L-647)',            script: 'check-height-fidelity.ts' },
  { name: 'write-route-auth (C08§1.2/L-406)',         script: 'check-write-route-auth.ts' },
  { name: 'command-naming (L-796)',                   script: 'check-command-naming.ts' },
  { name: 'layer-boundaries (L-809)',                 script: 'check-layer-boundaries.ts' },
  // §P1/P5/P6/P7-UNENFORCED (L-812) — the four principles C01 §5 listed as
  // hard-fail gates whose SCRIPT FILES DID NOT EXIST. Added 2026-08-09.
  { name: 'single-compose (P1/L-812)',                script: 'check-single-compose.ts' },
  { name: 'domain-purity (P5/L-812)',                 script: 'check-domain-purity.ts' },
  { name: 'no-direct-store-writes (P6/L-812)',        script: 'check-no-direct-store-writes.ts' },
  { name: 'visibility-intent-not-ui (P7/L-812)',      script: 'check-visibility-intent-not-ui.ts' },
  // §FIX-CHAT-CAPABILITY-BLIND (ADR-0313) — a registered bus command with no
  // chat capability metadata. Added 2026-08-10 after `wall.updateSystemTypeBatch`
  // and the chat panel shipped in the SAME release and could not reach each other.
  { name: 'chat-capability-coverage (ADR-0313)',      script: 'check-chat-capability-coverage.ts' },
  // W5-3 (2026-08-11). Born passing, so it is NOT on gate-debt.json. Every
  // property-mutation command type must declare where its subject id lives and
  // whether it reaches the CRDT document — or say in writing why it does not.
  // Registered because an undeclared verb is how the original defect stayed
  // invisible: a collaborator kept the creation-time value, confidently.
  { name: 'sync-disposition (C66/P8/W5-3)',           script: 'check-sync-disposition.ts' },
  // §RATCHET-R5 (2026-08-11) — the META-GATE. Ratchets DOWNWARD the number of
  // gates that lack a subject floor, i.e. that cannot tell "I looked and found
  // nothing" from "I looked nowhere". Born passing at 19 of 32 unfloored, so it
  // is NOT on gate-debt.json.
  //
  // Registered LAST deliberately: it is the only gate whose subject is the other
  // gates, so it should report after they have all had their say. And registering
  // it at all is the point — it shipped unwired, which is the same authored-but-
  // unreachable failure it exists to detect. A meta-gate nobody runs is exactly
  // the thing it is meant to catch.
  // R4 (2026-08-11) — dispatch sites that DISCARD an engine report payload. Born
  // at ZERO, negative-tested at 12 against a materialised pre-fix tree, so it is
  // NOT on gate-debt.json. The engine has always reported partials honestly; this
  // gate exists because the last layer threw that away and rendered "Done".
  { name: 'report-payload-discard (R4/W2-B)',         script: 'check-report-payload-discard.ts' },
  // C11 §4.2 / C16 §8.7 (2026-08-19, L-1151) — live batch-catalogue entries whose command
  // loops over elements OUTSIDE a batchCoordinator batch. Every such element pays TWO full
  // scene.traverse() passes over a GROWING scene (perAddGeometryGate.ts:36 -> initScene),
  // a REDETECT_ROOMS force-fire and a view re-projection: the O(n^2) behind a 32.7 s
  // viewport freeze on a 367-element gesture.
  // ⚠ NOT a numeric ratchet — a NAMED ledger, because a count is satisfiable by fixing one
  // command and regressing another. It fails in BOTH directions: a new unbatched command,
  // AND a ledger line whose debt was paid but left behind.
  // Registered at 4 named entries, negative-tested in both directions. Its honesty floors
  // exit 2 (never 0) when the catalogue will not parse or a named class does not resolve —
  // which is how its first run caught a class its own filename index could not see.
  { name: 'batch-creation-coverage (C11 §4.2/L-1151)', script: 'check-batch-creation-coverage.ts' },
  // R3 (2026-08-11) — independent polygon-offset implementations. The same offset
  // algorithm existed in THREE places at three levels of correctness, and the
  // UNTOUCHED copy was the one wired into the roof committer: a 300 mm eave
  // delivered 212 mm. Pinned at 0 rivals, not the 3 the header claimed — measured
  // against the gate's own predicate the pre-fix reading was 4, and a shrink-only
  // ratchet parked at 3 is three free slots.
  { name: 'offset-implementations (R3/W2-A)',         script: 'check-offset-implementations.ts' },
  // C100 §7 (2026-08-19, L-1120) — ONE material vocabulary. ⚠ It was BUILT at C100's
  // stamp time and NEVER REGISTERED: C100 §7 called it "BUILT", the contract cited it
  // as its enforcement, and `run-all.ts` had never heard of it. An unregistered gate
  // is the authored-but-unwired failure it exists to prevent, one level up.
  // Registered GREEN: 204 catalogue rows, 0 '#rrggbb' literals in the projection,
  // 0 in finishRef, 3 declared rivals. Its '0x' arm carries a declared debt of 4.
  { name: 'material-single-source (C100 §7)',         script: 'check-material-single-source.ts' },
  // C100 §2.1 / §9 (2026-08-19, L-1120) — elements REFERENCE materials by id. This is
  // the gate for the FOUR axes check-material-single-source.ts names as NOT CHECKED in
  // its own output, and which is where every measured material loss in L-1038 lives.
  // ⚠ FIVE arms since 2026-08-19 (L-1127), not four: ARM E measures the LOADER's
  // read side, which C100 §9.7 had listed as declared debt. It found `slab` on its
  // first run — a materialId written into the saved file and never read back.
  // ARM A colour-without-id · ARM B a stored materialId that resolves to NOTHING ·
  // ARM C a producer minting a key without the master resolver · ARM D persistence
  // round-trip. Shrink-only from the 2026-08-19 measurement; exits 3 on breach, 2 when
  // it cannot measure, so could-not-measure never aliases with measured-a-failure.
  { name: 'material-id-required (C100 §2.1/§9)',      script: 'check-material-id-required.ts' },
  // C15 §8.1 / C86 WO-B-3 (2026-08-19) — the hosted-opening dual-write gate. C15
  // §8.1's OWN stated enforcement was "a code-review checklist item", i.e. nothing,
  // and it had measurably failed on the two most-used door/window gestures. This
  // keys on CALL SITES of wallStore.updateDoor/updateWindow, repo-wide, because
  // two of the three live mutation surfaces are neither commands nor bus verbs —
  // a declaration-shaped census passed the repo while both violated. Shrink-only
  // at 3; the exit condition is 0, at which point it becomes hard-0.
  { name: 'hosted-dual-write (C15 §8.1/C86)',         script: 'check-hosted-dual-write.ts' },
  // C69 (2026-08-11) — the API verb register. Generated from handler sources and
  // diffed against the committed artefact, so a PR that adds a bus command without
  // a register row FAILS. This is what makes "always add it there" mechanical
  // rather than a promise; every hand-maintained list in this repo has rotted.
  { name: 'verb-register (C69)',                      script: 'check-verb-register.ts' },
  // Refusal identity — a refusal that loses its code is indistinguishable from a
  // generic "not applicable". 88 NAMED offenders keyed by file+fragment rather
  // than a count, so a PR that fixes one and breaks another still fails.
  { name: 'refusal-identity (C58 §1.13/§6)',          script: 'check-refusal-identity.ts' },
  // L-845 (2026-08-11) — the P4 blind spot: `window as unknown as X` defeats the
  // type system as completely as `as any` in two hops, and the `as any` ratchet
  // funnels new casts INTO this spelling unless it is also fenced. Born passing
  // at its measured baseline (212), so NOT on gate-debt.json. Exits 3 on breach.
  { name: 'cast-unknown (P4/L-845)',                  script: 'check-cast-unknown.ts' },
  // C8 (2026-08-11, d2730a0c) — collaboration preserves relationships. Authored in
  // the sync stream and deliberately left unregistered as a handoff, because this
  // runner is C9 territory; registered here the same day, so it never lived in the
  // authored-but-unwired state the check below exists to catch. Its harness lives
  // in apps/sync-server (needs ws/y-websocket); floors are imported from there and
  // exit 2 on an unestablished subject; its RATCHET=0 breach reports at the
  // declared level. Exit-3 semantics are honoured by this runner's existing branch.
  { name: 'collab-graph-integrity (C8/L-391)',        script: 'check-collab-graph-integrity.ts' },
  // BIM20 Wave 3 (2026-08-11, handoff from the C10 stream) — every declared
  // cascade event must have a listener AND a prevState-carrying emitter; EV-03
  // proved either alone is insufficient. Pure static analysis, so it lives with
  // the other static gates and runs here; the file stays in
  // tools/rac-conformance/certification/gates/ beside the cascade-events.json
  // ledger it reads — the PATH is what is registered, not a copy. It self-ledgers
  // 8 findings (all four events: no listener, no prev-state) and exits 1 at that
  // declared level, so it carries a gate-debt.json line; below its floors it
  // exits 2. NOTE: it sits outside GATE_DIR, so the R5 meta-gate does not inspect
  // it — its floors are enforced by its own contract.ts, which prints them.
  { name: 'propagation-reaches (BIM20-W3/EV-03)',     script: '../rac-conformance/certification/gates/check-propagation-reaches.ts' },
  // §GATE-AUTHORED-BUT-UNWIRED (2026-08-11, C9) — CA-21 (C16 §5.1) enforcement.
  // Committed 2026-08-11 in 1eba6011 and registered in NOTHING until now: not this
  // runner, not ci.yml, not package.json. It is the complement of verb-register —
  // the register says what EXISTS, this says what has been WATCHED TO WRITE, by
  // executing a dispatch and reading the authoritative store back.
  //
  // ⚠ It EXECUTES a harness against the real composition root and takes minutes.
  // If it exits 2 here, that is the gate being honest: CA-21 admits no substitute
  // for an executed read-back, so a harness that cannot run has established no
  // subject and must not report a pass.
  { name: 'verb-liveness (C16 §5.1 CA-21)',           script: 'check-verb-liveness.ts' },
  // BIM 3.0 Phase 1 Tier 1 (2026-08-12) — the three manifest/single-file gates of
  // BIM30-READINESS-GATES §5. All three LAND RED, which is the point (§2.3): a gate
  // deferred until its subject is fixed is how a subject stays unfixed. Each runs a
  // planted-violation control INSIDE the run and exits 2 as a blind comparator if a
  // control fails to fire, so their silence can never be mistaken for coverage.
  //
  // ⚠ Each lands at exit 1 against a NAMED ledger in its own header (or, for
  // epsilon-policy, `epsilon-policy-baseline.json`). They are deliberately NOT on
  // gate-debt.json — whether the suite should absorb them is a decision for whoever
  // owns that file, not something a new gate should quietly grant itself.
  { name: 'solver-is-real (C74 §3.3/§3.7)',           script: 'check-solver-is-real.ts' },
  { name: 'provenance-not-invented (C75 §2.1)',       script: 'check-provenance-not-invented.ts' },
  { name: 'epsilon-policy (C73 §5.1)',                script: 'check-epsilon-policy.ts' },
  // BIM 3.0 Phase 1 Tier 2 (2026-08-12) — the three static gates of
  // BIM30-READINESS-GATES §3.10 / §3.11 / §3.14. Same discipline as Tier 1: each
  // lands RED at a NAMED, shrink-only ledger pinned at its measured first reading,
  // runs planted-violation controls INSIDE every run (exit 2 as a blind comparator
  // if an arm stays silent), and carries a gate-newly-measured.json entry added in
  // the same change — NOT gate-debt.json, for the same reason as Tier 1.
  { name: 'prevstate-contract (C72 §3, §6.2)',        script: 'check-prevstate-contract.ts' },
  { name: 'suppression-is-reversible (C72 §4, §6.3)', script: 'check-suppression-is-reversible.ts' },
  { name: 'no-hidden-mock (C74 §3.2/§3.4/§3.5)',      script: 'check-no-hidden-mock.ts' },
  // BIM30-READINESS-GATES §3.12 · C70 G-INV-1 + G-INV-2. STATIC by §2.1a: both
  // arms read the tree at HEAD (adapter delegation vs declared `kind`; rule
  // families parsed from ConstraintEngine.ts source, cross-referenced against
  // every executable-evidence file). Importing the engine to drive it would be
  // EXECUTED — it touches `window` at module scope — and would answer the wrong
  // question: G-INV-2 asks whether evidence EXISTS in the repo, not what one run
  // computes. Sibling to check-solver-is-real and disjoint from it: that gate
  // asks the EXTERNAL questions (is the named engine a declared dependency; does
  // a selector conflate not-configured with configured-but-failed), this one asks
  // the INTERNAL ones (does delegation match declared identity; does every rule
  // family have executable evidence at its declared strength). No shared arm key,
  // no shared ledger entry.
  { name: 'constraint-honesty (C70 G-INV-1/2, C74 §3.1/§3.2/§3.5)', script: 'check-constraint-honesty.ts' },
  // C77 (2026-08-12) — the secrets & configuration register. The C69 pattern on
  // the config surface: generated from the read-sites, diffed against the
  // committed artefact both directions, PRESENCE-NEVER-VALUE in every arm (the
  // gate value-leak-checks its own outputs and fails closed at exit 2). Lands
  // RED at a NAMED shrink-only ledger of undeclared env names pinned at the
  // first honest reading — gate-newly-measured.json, same change, per the
  // Tier 1/Tier 2 discipline.
  { name: 'secrets-register (C77 §6)',                script: 'check-secrets-register.ts' },
  // C71 §6 · C70 §7 row C-INV-1/C-INV-4 (2026-08-12) — the relationship
  // vocabulary is SCOPED and SHRINKING. Named by C70 §7 as required with NO FILE
  // AT HEAD, which §7.1 makes a named gap whose only honest status is UNPROVEN.
  //
  // ⚠ RESIDENCY DEVIATION, stated not hidden: C71 §6's preamble puts all three
  // graph gates in the certification tree. This one is STATIC by the
  // BIM30-READINESS-GATES §2.1a boundary test — it needs nothing that does not
  // exist until something runs — so it lives and runs here beside the other
  // static single-pass scans, and imports the ONE exit-code contract (§2.1b),
  // which is what C70 §7.2 actually objected to. Full argument in its header.
  //
  // Lands RED at exit 1 against a NAMED, shrink-only ledger in its own header
  // (5 entries, both directions), with SIX planted-violation controls executed
  // INSIDE every run — including a positive control, so it can never be merely
  // stuck red — and exit 2 as a blind comparator if any control stays silent.
  // Carries a gate-newly-measured.json entry, NOT gate-debt.json: its findings
  // predate it and nobody chose to ship them.
  { name: 'graph-write-coverage (C71 §6 · C-INV-1/4)', script: 'check-graph-write-coverage.ts' },
  // L-849/L-851 (2026-08-13) — every test file must be matched by at least one
  // runner's include globs. Born from two measured incidents the same day: a
  // geometry-lift suite that had NEVER run (L-849, 11 recovered tests) and the
  // repo-wide sweep it demanded, which found 147 dark files — including 72
  // specs (~1,140 cases) pointed at by this repo's own ROOT vitest config via
  // two founding patterns naming a directory that no longer exists (L-851).
  // Lands RED at a NAMED shrink-only 137-row ledger checked in both directions,
  // with planted/clean fixture repos exercised INSIDE every run (exit 2 as a
  // blind comparator if an arm stays silent) and a demonstrated exit-0 state
  // (L-716). Scope printed in its own output: GLOB REACHABILITY, not CI
  // invocation — scripts/check/check-test-ci-coverage.mjs owns that axis.
  { name: 'no-dark-test-files (C70 §4.2 · L-849/L-851)', script: 'check-no-dark-test-files.ts' },
  // SPEC-49 CI-2 (2026-08-13; CI-1/CI-4 ledgered 2026-08-14 by FOUNDER DECISION)
  // — GENERATOR OUTPUT QUALITY, WHICH WAS ENTIRELY
  // UNGATED. Verified by enumeration in SPEC-49 §3 item 6: not one of the 56 gates
  // above read `doorAdjacentTo`, read `unreachableHabitableRoomIds`, or DROVE any
  // generator. The two that mention `apartmentLayout` are about refusal MESSAGING.
  // So the founder's production report — "rooms without doors · the corridor doesn't
  // reach the relevant bedrooms" — could not have been caught by anything here.
  //
  // ⚠ It EXECUTES the three real production entries (generateDeterministicLayouts,
  // generateHouseLayout, orchestrateResidentialBuilding) over the committed sweeps
  // and reads `LayoutOption.circulation`, the verdict CI-0 (1559275e) stopped
  // throwing away at the emit boundary. ~9s for 166 generator runs. It deliberately
  // does NOT count files or field declarations: a gate that counts ARTEFACTS can be
  // satisfied by producing artefacts, which is how check-move-propagation went green
  // over a consumer file wired into nothing.
  //
  // Lands RED at exit 1 against a NAMED shrink-only 38-row ledger
  // (generator-circulation-ledger.json: DOORLESS ×18 · UNREACHABLE ×12 ·
  // CORRIDOR-STAIR-GAP ×6 · CORRIDOR-HALL-GAP ×2 — the CI-1/CI-4 classes pinned
  // 2026-08-14 at the executed reading under the founder decision that closed
  // SPEC-49 §4's standing ledger question), checked in both directions, with 8
  // planted/clean controls executed INSIDE every run — exit 2 as a blind comparator
  // if any arm stays silent. Carries a gate-newly-measured.json entry, NOT
  // gate-debt.json: the defects predate the instrument and nobody chose to ship them.
  { name: 'generator-circulation (SPEC-49 CI-1/CI-2/CI-4)', script: 'check-generator-circulation.ts' },
  // C70 K-INV-2 · C08 §3.1/§3.3 · P8 (2026-08-14) — CB-04. THE CONFLICT-SURFACING
  // HALF OF P8, WHICH HAD NO INSTRUMENT AT ALL. `fb7cd4a0` (§RIVAL-MINT) stopped
  // the CRDT EATING disjoint properties; nothing measured whether a merge that
  // legitimately DISCARDS one side's value SAYS SO. Convergence and disclosure are
  // two different facts and this suite exists because two different facts must
  // never print the same value.
  //
  // ⚠ It DRIVES 309 real merges through real `YjsDocAdapter` pairs and the
  // production `SYNC_DISPOSITIONS` table — it counts REACHED BEHAVIOUR, never
  // files: a gate that counted conflict-handling FILES would be satisfied by
  // writing one. It lives in the certification tree beside the other
  // collaboration gates and imports the ONE exit-code contract (../contract.ts);
  // the PATH is what is registered, not a copy.
  //
  // Lands RED at exit 1 against a NAMED shrink-only 103-row ledger
  // (conflict-surfacing-ledger.json), checked in BOTH directions, with 6
  // controls executed INSIDE every run — including a PLANTED SILENT MERGE that
  // must be flagged BY NAME and a clean corpus that must read 0 (L-716
  // satisfiability) — and exit 2 as a blind detector if any control stays
  // silent. Carries a gate-newly-measured.json entry, NOT gate-debt.json.
  { name: 'conflict-surfacing (C70 K-INV-2 · CB-04)',  script: '../rac-conformance/certification/gates/check-conflict-surfacing.ts' },
  // §GATE-AUTHORED-BUT-UNWIRED, round 2 (2026-08-14) — FOUR COMMITTED GATES WERE
  // REGISTERED IN NO RUNNER AT ALL. Not this array, not ci.yml, not package.json:
  //   check-derived-not-authored · check-deterministic-regeneration
  //   check-predicate-canonical  · check-provenance-coverage
  // Same shape as check-verb-liveness (2026-08-11) and it matters more, because
  // these are cited as evidence: check-predicate-canonical is the instrument GE-02,
  // GE-03 and GE-12 are measured against, and check-deterministic-regeneration is
  // one of three gates GE-07 is recorded CLOSED on. Those readings were real — and
  // they were enforcement only for as long as a human remembered to type the
  // command. The `committed` pre-flight above has been shouting about all four on
  // every run since they landed; this is the other half of that complaint.
  //
  // TWO OF THE FOUR ARE REGISTERED HERE. Each was RE-RUN at HEAD before its row was
  // written — a gate registered on a reading someone else reported is a gate
  // registered on hearsay, and this array is not the place to find out:
  //   ✓ derived-not-authored  exit 0 CLEAN, hard-0, no baseline. 4540 files, all 5
  //                           arms watched firing against a planted tree, positive
  //                           control (clean tree) 0.
  //   ✓ predicate-canonical   exit 0 CLEAN, hard-0, no baseline. C1/C2/C3 all 0.
  // Both are born-passing and therefore on NEITHER ledger — nothing to absorb.
  //
  //   ✓ provenance-coverage           REGISTERED BELOW (2026-08-14), and it registers
  //     CLEAN — which is why waiting was worth it. It was held at exit 1 / declared 1
  //     (FINDING C2: FloorDetectionMethod is an element-family provenance vocabulary
  //     and there was no defineElement('floor') in L0 at all), and registering THAT
  //     would have needed a gate-newly-measured.json entry, because this runner
  //     cannot read a gate's internal declared level — it reads the exit code and
  //     then asks the two ledgers, so an unledgered exit 1 prints as "❌ REGRESSION"
  //     which would have been FALSE. Registration was deferred rather than absorbed;
  //     PV-08 then gave `floor` an L0 schema and drove the ledger 1 → 0 (5c9b48e7),
  //     so the row lands as hard-0 on NEITHER ledger — nothing tolerated anywhere.
  //     Re-run at HEAD by the registering commit: "[0] CLEAN — 0 findings, hard-0,
  //     no baseline", floors 28 kinds / 30 element files / 4372 outside files /
  //     canonical union 1 / L0 map 1 / 18 members read / controls 1.
  //     ⚠ The general lesson, kept because it will recur: an instrument under live
  //     extension must not be pinned mid-change. A pin taken that day would have
  //     minted a tolerated-debt row for a defect that was fixed hours later, and
  //     tolerated rows are far harder to remove than to add.
  //   ✓ deterministic-regeneration    REGISTERED BELOW (2026-08-14) — and the path it
  //     took is the ratchet working, recorded so nobody reads the row as routine: it
  //     sat at exit 3 RATCHET EXCEEDED (135 vs 134) because re-anchoring its three
  //     stale ledger rows (28a25791) uncovered one genuinely NEW post-baseline site,
  //     packages/geometry-kernel/src/pure/polygonBoolean.ts:307. Exit 3 is NEVER
  //     absorbable (C70 §5.1), so registration refused to proceed until the site was
  //     FIXED — 13d48db7, cut-parameter order made spec-defined — never ledgered.
  //     Re-run at HEAD by the registering commit: exit 1 DECLARED-LEVEL, 134/134,
  //     new: 0 · struck: 0 on all three arms. Its gate-newly-measured.json entry
  //     lands in this same commit.
  // The absence is recorded rather than quietly dropped, because "we looked and it
  // was not ready" and "nobody looked" must not print the same — which is the whole
  // reason the committed-but-unregistered pre-flight exists.
  { name: 'derived-not-authored (C75 §2.2/§2.6/§2.7)',  script: 'check-derived-not-authored.ts' },
  { name: 'predicate-canonical (C73 §3.1/§3.3)',        script: 'check-predicate-canonical.ts' },
  { name: 'deterministic-regeneration (C73 §1.3/§6 · GE-07)', script: 'check-deterministic-regeneration.ts' },
  { name: 'provenance-coverage (C75 §3.1/§3.3 · PV-08)', script: 'check-provenance-coverage.ts' },
  // GE-12 (2026-08-14) — the triangulation family and the PlanarTopologyEngine
  // family, COUNTED for the first time. Structural detection (C73 §3.2): four
  // arithmetic anchors for triangulation bodies, a two-anchor conjunction for
  // the planar engine — the register's "~5"/"~3" were name censuses and both
  // undercount (measured 7 bodies / 6 files + 4 engine copies; auto-dimension's
  // traceFaces is a fourth engine body the class name never matched). Lands at
  // exit 1 against triangulation-canonical-baseline.json pinned at that
  // reading, shrink-only, with 8 executed controls per run (exit 2 as a blind
  // comparator if one stays silent) and a real-tree planted-duplicate test
  // recorded in its header. Carries a gate-newly-measured.json entry landing in
  // the SAME commit — NOT gate-debt.json: the bodies predate the instrument and
  // nobody chose to ship them. The COLLAPSE is a later PR (C73 §3.5, one family
  // per PR); this row is the arm that makes a sixth triangulator or a fifth
  // engine copy fail loudly in the meantime.
  { name: 'triangulation-canonical (GE-12 · C73 §3)',   script: 'check-triangulation-canonical.ts' },
  // §GATE-AUTHORED-BUT-UNWIRED, round 3 (2026-08-15) — THIRTEEN gate files under
  // tools/rac-conformance/certification/gates/ were registered in NEITHER runner
  // and had therefore NEVER EXECUTED in any automated run. This is §2.1d recurring
  // with the hole moved: last time the DETECTOR could not see the second gate home,
  // and extending it (above) is what made these thirteen visible. The detector has
  // been shouting `❌ 13 gate file(s) … registered in NEITHER runner` on every run
  // since; this array is the other half of that complaint.
  //
  // ⚠ WHY IT MATTERS MORE THAN A COUNT: `check-relationship-determination` IS THE
  // BAR-3 GATE. The programme's headline metric — 126 findings — comes from a gate
  // nothing invoked, so nothing prevented it regressing; the number was enforcement
  // only for as long as a human remembered to type the command. Same for
  // `check-no-empty-means-unknown` (the GR-14 drain, hand-run at 63) and
  // `check-move-propagation` (GR-12, 1/1).
  //
  // RESIDENCY (§7.4 / §2.1a — the boundary test is ONE question: does the gate need
  // something that does not exist until something runs?). Decided PER GATE by reading
  // each file's imports and header, NOT batched:
  //   • TWELVE answer NO. They import `node:fs` + `node:path` + `../contract.js`
  //     (+ `./scan.js`) and NOTHING ELSE: no dynamic import of a package, no store
  //     composition, no runtime, and no read of `results/` (verified — zero hits).
  //     They scan committed source at HEAD, so they are STATIC and belong to THIS
  //     runner. Four of them say so in their own headers, in their own words:
  //     graph-delete-integrity ("Discovery is static"), graph-persistence ("This is a
  //     STATIC gate"), generation-is-consequential ("WHY THE CHECK IS STATIC, SAID
  //     PLAINLY" — its execSync is `git rev-parse --show-toplevel`, not a harness),
  //     relationship-determination. Their DIRECTORY is the certification tree and
  //     stays there beside the ledgers they read — residency is about the RUNNER; the
  //     PATH is what is registered, never a copy (§2.1a, the check-propagation-reaches
  //     precedent). They import the ONE exit-code contract, which is what §2.1b asks.
  //   • ONE answers YES: `check-move-propagation` composes the REAL SlabStore, the
  //     REAL SlabDependencyTracker, `await import('@pryzm/geometry-slab')` and a
  //     happy-dom window, then MOVES A WALL and reads the effect back. It is
  //     EXECUTED and is registered in certify.ts instead.
  //
  // TWO OF THE THIRTEEN WERE DELIBERATELY NOT REGISTERED, and the absence was
  // recorded rather than dropped — "we looked and it was not registrable" and
  // "nobody looked" must not print the same. ⭐ BOTH ARE NOW CLEARED (lane G2,
  // A.12, 2026-08-16), and the reason is worth keeping: NEITHER was the breach it
  // was recorded as. Three of the four exit-3 causes were FALSE POSITIVES OF THE
  // GATES THEMSELVES, in the same shape both times — the gate's SUBJECT was wider
  // than the CONTRACT'S CLAUSE, so it judged sites and symbols the clause never
  // bound. Exactly one cause was real debt-keeping, and it was a PAID row that had
  // never been struck.
  //
  //   ✓ check-region-reference-frame  exit 3 → exit 0 CLEAN. The finding
  //     (FinishSegmentAdapter.ts:150) was a `{x,z}`↔`{x,y}` type ADAPTER that
  //     forwards `reference: edge.reference`. C79 §3.1/§3.2 bind a region-TRACED
  //     edge — the act of CHOOSING a frame; a translation chooses nothing. It fired
  //     on the family that honours §3 BEST: the finish frame is refused one layer up
  //     at reprojectFinishBoundary.ts:236-242 with the typed C78 §8.1 reason
  //     GEOMETRY_UNPREDICTABLE, policing both arms, with its own negative test.
  //     Registered below. §FORWARDING-IS-NOT-CHOOSING.
  //
  //   ● check-index-can-refuse        exit 3 → exit 1, 8 findings / named ledger 8.
  //     ⚠ NOT REGISTERED HERE YET, and the reason is a FILE-OWNERSHIP fence, not a
  //     gate defect: an exit-1 gate on neither ledger prints ❌ REGRESSION and
  //     hard-fails this suite for every lane, so it needs a gate-newly-measured.json
  //     entry — and that file had UNCOMMITTED edits from a concurrent lane when G2
  //     ran. Committing it would have committed another lane's work in progress.
  //     The entry JSON and the one-line row for this array were handed off intact.
  //     Its own exit 3 was: 1 STALE ROW (DoorDependencyTracker — paid, unstruck,
  //     now struck) + 3 UNLEDGERED that were false positives — ARM B read ONE FILE
  //     per subject (so two constructor-only subclasses of a base THIS GATE scores
  //     as able to refuse read as unable) and policed C78 §8.1's ELEVEN-member
  //     closed union against a hand-copied FIVE (so RoofDependencyTracker's
  //     ENGINE_NOT_AVAILABLE refusal was invisible). The union is now parsed from
  //     source; the ledger was NOT grown.
  //
  //   Exit 3 is NEVER absorbable by either ledger (§RATCHET-EXCEEDED-IS-NEVER-DEBT,
  //   R7 / L-836 / C70 §5.1) — the rule held, and it is what forced the diagnosis
  //   that found the false positives instead of ledgering them.
  //
  // Every row below was RE-RUN AT HEAD by the registering commit — a gate registered
  // on a reading someone else reported is a gate registered on hearsay. All floors
  // met on all eleven; no gate exited 2.
  //   ✓ provenance-export-boundary  exit 0 CLEAN, hard-0, no baseline.
  //   ✓ region-fallback-populated   exit 0 CLEAN, hard-0, no baseline.
  //   ✓ region-host-attribution     exit 0 CLEAN, hard-0, no baseline.
  //   ● relationship-determination  exit 1, 126/126 — THE BAR-3 READING, CONFIRMED
  //                                 by a runner that now invokes it.
  //   ● no-empty-means-unknown      exit 1, 63/63 (GR-14 hand-run reading confirmed).
  //   ● dependency-fields-honoured  exit 1, 13/13.
  //   ● graph-delete-integrity      exit 1, 10/10.
  //   ● graph-persistence           exit 1, 3/3.
  //   ● no-silent-partial           exit 1, 3/3.
  //   ● generation-is-consequential exit 1, 1/1.
  // The seven `●` rows land RED on defects that PREDATE them and that nobody chose
  // to ship, so each carries a gate-newly-measured.json entry added in THIS commit
  // (§2.4 / §7.6) — NOT gate-debt.json, which requires the founder.
  { name: 'provenance-export-boundary (C75 §5 · PV-04)',        script: '../rac-conformance/certification/gates/check-provenance-export-boundary.ts' },
  { name: 'region-fallback-populated (C79 §8)',                 script: '../rac-conformance/certification/gates/check-region-fallback-populated.ts' },
  // Registered by lane G2 (A.12), RE-RUN AT HEAD by the registering commit: exit 0
  // CLEAN, 5 sites swept, 0 findings, all floors met. STATIC — it reads committed
  // source and needs nothing that exists only once something runs, so §2.1a/§7.4
  // puts it in THIS runner beside region-fallback-populated, with which it shares
  // one sweeper and one ledger. Hard-0 with no baseline: it needs no ledger entry.
  { name: 'region-reference-frame (C79 §3 · §8)',               script: '../rac-conformance/certification/gates/check-region-reference-frame.ts' },
  { name: 'index-can-refuse (C78 §20 · U-INV-7)',               script: '../rac-conformance/certification/gates/check-index-can-refuse.ts' },
  { name: 'region-host-attribution (C79 §6.3)',                 script: '../rac-conformance/certification/gates/check-region-host-attribution.ts' },
  { name: 'relationship-determination (C78 §20 · U-INV-1 · BAR-3)', script: '../rac-conformance/certification/gates/check-relationship-determination.ts' },
  { name: 'no-empty-means-unknown (C78 §20 · U-INV-4 · GR-14)', script: '../rac-conformance/certification/gates/check-no-empty-means-unknown.ts' },
  { name: 'dependency-fields-honoured (C79 §8)',                script: '../rac-conformance/certification/gates/check-dependency-fields-honoured.ts' },
  { name: 'graph-delete-integrity (C71 §6 · C70 F-INV-2)',      script: '../rac-conformance/certification/gates/check-graph-delete-integrity.ts' },
  { name: 'graph-persistence (C71 §6 · C70 I-INV-2/3)',         script: '../rac-conformance/certification/gates/check-graph-persistence.ts' },
  { name: 'no-silent-partial (C68 §5 · batch partials)',        script: '../rac-conformance/certification/gates/check-no-silent-partial.ts' },
  { name: 'generation-is-consequential (C80 §7 · GEN-GAP-1)',   script: '../rac-conformance/certification/gates/check-generation-is-consequential.ts' },
  // §BIM30-CARRIED-ROWS (2026-08-17). Both of these exist to convert BIM 3.0
  // register rows out of the CARRIED class — rows whose status was inherited from
  // prose because their "deciding instrument" was a human reading source once, or
  // the sentence "the three gates themselves". `bim30-status` prints such a row as
  // *"declared CLOSED — instrument is not a runnable gate"*: not evidence at HEAD.
  { name: 'source-verified-invariants (GR-15 · PR-05/06/07/13)', script: '../rac-conformance/certification/gates/check-source-verified-invariants.ts' },
  { name: 'gate-residency (GR-11 · PR-08 · GE-07 · CO-11 · PV-07)', script: '../rac-conformance/certification/gates/check-gate-residency.ts' },
  // ⚠ SLOWEST GATE IN THIS RUNNER after per-package-compile: it SPAWNS HARNESS 5
  // (~2 min) rather than reading yesterday's artefact, because a gate that reads a
  // stale results file has measured nothing. Freshness is one of its floors.
  { name: 'graph-runtime-readback (GR-09 · GR-18 · C71 §5.5/§5.8)', script: '../rac-conformance/certification/gates/check-graph-runtime-readback.ts' },
  // Both spawn the suite their row CITES rather than reading a stale artefact,
  // and both add the arm the suite itself cannot reach: production REACHABILITY
  // of the registrar (GR-16), and the cross-layer `ubg`-key census that an L2
  // test is structurally barred from performing (GR-17).
  { name: 'graph-query-verbs (GR-16 · C70 D-INV-1/3)',           script: '../rac-conformance/certification/gates/check-graph-query-verbs.ts' },
  { name: 'ubg-snapshot-derived (GR-17 · C71 §4 · C70 I-INV-2)', script: '../rac-conformance/certification/gates/check-ubg-snapshot-derived.ts' },
  { name: 'geometry-change-consumers (PR-10 · PR-12 · C72 §1.1)',  script: '../rac-conformance/certification/gates/check-geometry-change-consumers.ts' },
  // §BIM30-CARRIED-ROWS, second batch (2026-08-18) — the GE/CO/PV half. Eight more
  // register rows whose deciding instrument was the phrase "source census" /
  // "source re-measure" / a pair of filenames, and which `bim30-status` therefore
  // printed CARRIED. Four of the eight ALSO carried "NOT DETERMINED" in their own
  // reading cell while the row read CLOSED.
  { name: 'census-verified-invariants (GE-04 · GE-10 · CO-05 · CO-07 · CO-10)', script: '../rac-conformance/certification/gates/check-census-verified-invariants.ts' },
  // The three below SPAWN the suite their row cites, and each adds the arm that
  // suite structurally cannot reach: GE-05's union EXPORT (not a mention),
  // PV-05's APP-copy serialiser/loader pair (the cited suite pins only the L3
  // copy — break the app copy and it still passes 11/11), and PV-06's exemption
  // list (the cited suite derives IN_SCOPE *from* that list, so it cannot notice
  // the list growing under it).
  { name: 'polygon-boolean-canonical (GE-05 · C73 §3/§6)',        script: '../rac-conformance/certification/gates/check-polygon-boolean-canonical.ts' },
  { name: 'provenance-slice-persisted (PV-05 · C70 I-INV-2/3)',   script: '../rac-conformance/certification/gates/check-provenance-slice-persisted.ts' },
  { name: 'element-confidence-declared (PV-06 · C75 §1.3/§5)',    script: '../rac-conformance/certification/gates/check-element-confidence-declared.ts' },
  // §R5 — the meta-gate runs LAST: its subject is the other gates.
  // §GE-08 (C73 §5.4b) — the FIRST dynamic determinism arm in this suite. Every
  // other determinism check here is a static read; this one RUNS the geometry in
  // three separate processes (including one under --jitless) and compares raw
  // IEEE-754 bytes. It is registered as a hard gate because it was born passing
  // at 4/4 and a disagreement is never tolerable: geometry that differs between
  // two runs on ONE machine cannot converge between two clients.
  // ⚠ It does NOT prove cross-MACHINE determinism or GPU geometry, and it says so
  // on every run. GE-08 stays UNPROVEN for those two — do not cite this as closure.
  { name: 'cross-process-determinism (C73 §5.4b, partial)', script: 'check-cross-process-determinism.ts' },
  { name: 'gate-subject-floors (R5/L-811)',           script: 'check-gate-subject-floors.ts' },
  // ─── L-960 / L-1202 (2026-08-19, lane REG1) — the DOCUMENT-SIDE gates ───────
  // Every other gate in this list polices CODE. These two police the CONTRACT
  // SUITE that governs the code, and they exist because
  // CONTRACT-AMENDMENT-REGISTER.md measured what nothing was checking:
  // **97 of 99 cited gate paths do not exist**, and the suite range has now
  // rotted FIVE times (C67 -> C81 -> C84/C85–C99 -> C100 -> C76).
  //
  // Both are registered LAST, after the R5 meta-gate, because their subject is
  // documentation rather than the tree, so a failure here must never mask a code
  // failure above it. Both carry F0 floors + planted controls that run INSIDE
  // every invocation and exit 2 as blind comparators (L-827), and both land at a
  // NAMED shrink-only baseline pinned at their first honest reading — recorded
  // in gate-newly-measured.json, NOT gate-debt.json, per C76 §6.3: these are
  // defects that PREDATE the gate, so calling them a regression blames the
  // gate's author and absorbing them as debt backdates a decision never made.
  //
  // ⚠ The register sized the first of these at "119+ defects". It measures 491.
  { name: 'contract-cited-paths (L-960 · REGISTER §0)',        script: 'check-contract-cited-paths.ts' },
  { name: 'contract-index-equivalence (REGISTER §1 · C00)',    script: 'check-contract-index-equivalence.ts' },
];

// §FIX-GATE-REGISTERED-TWICE (2026-08-11, C9). `check-report-payload-discard.ts`
// was registered TWICE — once as "report-payload-discard (R4/W2-B)" and again as
// "report-payload-discard (C68 §5.g, R4)". Two rows, one file, so the suite ran it
// twice, and every tally it printed ("35 passing", "40 gates") counted one gate
// twice while implying 40 distinct subjects. The duplicate is removed rather than
// renamed, and the invariant is enforced below so the next copy-paste fails loudly
// instead of inflating coverage: a suite that miscounts ITSELF cannot be the
// authority on whether anything else is honest.
const dupes = [...new Map<string, number>(
  GATES.map((g) => [g.script, GATES.filter((x) => x.script === g.script).length]),
).entries()].filter(([, n]) => n > 1);
if (dupes.length > 0) {
  console.error(
    `\n[ga-gate/run-all] ❌ ${dupes.length} gate script(s) registered more than once:\n`
    + dupes.map(([s, n]) => `    - ${s}  ×${n}`).join('\n')
    + '\n  A duplicate row inflates every count this runner prints. Remove it.',
  );
  process.exit(1);
}

let anyFailed = false;

console.log('[ga-gate/run-all] Running all GA convergence gates...\n');

// §GA-GATE-RUNNER-COULD-NOT-SPAWN (L-774) — THE SUITE HAS NEVER RUN ON WINDOWS.
//
// `spawnSync('npx', …)` WITHOUT `shell: true` cannot execute `npx` on win32,
// because the thing on PATH is `npx.cmd` and Node's spawn will not run a `.cmd`
// through the raw CreateProcess path. Every gate therefore returned
// `status: 1` with NO output, and the runner faithfully reported all 25 as
// FAILED — including gates that pass in isolation seconds earlier
// (`check-project-isolation`, `check-declared-project-scopes` both do).
//
// ⚠ THAT IS WHY NOBODY WIRED IT INTO CI. The launch audit correctly found this
// suite is "invoked by nothing" and read that as neglect. The likelier story is
// the reverse: someone tried, saw 25/25 fail on their machine, could not tell a
// broken runner from a broken codebase, and left it out. A verification tool that
// fails 100% of the time teaches nothing and gets switched off — the same lesson
// as the deploy proof that once failed a healthy release.
//
// The tell was cheap and available the whole time: a gate that PASSES standalone
// and FAILS inside the runner is a statement about the RUNNER. Total failure is
// almost never 25 independent defects.
//
// `shell: true` is the portable fix (POSIX unaffected). The path is quoted
// because a shell re-parses the argv.
const NEEDS_SHELL = process.platform === 'win32';
const spawnGate = (scriptPath: string) => spawnSync(
  'npx',
  ['tsx', NEEDS_SHELL ? `"${scriptPath}"` : scriptPath],
  { stdio: 'inherit', encoding: 'utf8', shell: NEEDS_SHELL },
);

// §GA-GATE-RATCHET (L-775) — SHRINK-ONLY DEBT BASELINE.
//
// Fixing L-774 let this suite run for the first time and revealed 16 genuine
// failures — drift accumulated over however long nothing was checking. Two bad
// options and one good one:
//
//   ✗ Wire it in blocking now  → every PR fails on pre-existing debt, so within a
//                                day someone adds `continue-on-error: true` and we
//                                are back to a gate that gates nothing. That is
//                                exactly how the EXISTING ga-gate job ended up
//                                advisory.
//   ✗ Leave it unwired         → the 16 stay invisible and grow.
//   ✓ Ratchet                  → today's failures are DECLARED DEBT; CI blocks a
//                                gate that newly breaks, and blocks a gate that
//                                starts passing without being removed from the
//                                baseline. Debt can only shrink.
//
// This mirrors `declared-project-scope-debt.json`, the pattern already proven in
// this repo. Keyed on `script` (a filename) not `name` (a display string that
// carries phase tags and gets edited).
//
// ⚠ A BASELINED GATE THAT STARTS PASSING IS A FAILURE. Without that rule the
// baseline is write-only: debt gets paid and nobody notices, so the file drifts
// into a list of things that are actually fine and stops meaning anything. Being
// forced to delete the line is what makes the number trustworthy.
const debtPath = join(__dir, 'gate-debt.json');
let baseline: Set<string>;
try {
  const raw = JSON.parse(readFileSync(debtPath, 'utf8')) as { failing?: string[] };
  baseline = new Set(raw.failing ?? []);
} catch {
  // No baseline file ⇒ no declared debt ⇒ every failure is a regression. That is
  // the correct default: absence of a debt file must not mean "tolerate anything".
  baseline = new Set<string>();
}

// §NEWLY-MEASURED (2026-08-12) — THE THIRD STATE, AND WHY THIS RUNNER NEEDED ONE.
//
// Until today this runner could print exactly two verdicts for a failing gate:
// 🟡 KNOWN-DEBT (it is on gate-debt.json) or ❌ REGRESSION (it is not). BIM 3.0
// Phase 1 produces a gate that is NEITHER: newly BUILT, landing RED on defects
// that PREDATE it. Nothing got worse — the instrument arrived — and nobody chose
// to ship the defect, because nobody had ever measured it.
//
// Both existing labels lie about it, in opposite directions:
//   ❌ REGRESSION says the tree got worse the day someone wrote a scanner. That
//      trains readers to treat red as noise, which is how this whole suite ended
//      up unwired (L-774).
//   🟡 KNOWN-DEBT backdates a decision nobody made, converting "we have never
//      looked at this" into "we accepted this" — two different facts printing the
//      same value, the §CONTEXT-DATA-HONESTY failure this repo keeps paying for.
//
// So it gets its own file (tools/ga-gate/gate-newly-measured.json — the argument
// for a sibling rather than a section is in that file's $comment) and its own
// label, 🔵 NEWLY-MEASURED. The rule that matters: THIS FILE ABSORBS EXIT 1 ONLY.
// A pinned reading exceeded exits 3 from the gate itself and is caught by
// §RATCHET-EXCEEDED-IS-NEVER-DEBT above, before this map is ever consulted.
interface NewlyMeasuredEntry {
  gate: string;
  runner?: 'ga-gate' | 'certify';
  reviewBy?: string;
  firstReading?: string;
  exitCondition?: string;
}
const newlyPath = join(__dir, 'gate-newly-measured.json');
const newlyMeasured = new Map<string, NewlyMeasuredEntry>();
try {
  const raw = JSON.parse(readFileSync(newlyPath, 'utf8')) as { entries?: NewlyMeasuredEntry[] };
  for (const e of raw.entries ?? []) newlyMeasured.set(e.gate, e);
} catch {
  // Absent file ⇒ no newly-measured gates ⇒ every failure is debt or regression.
  // Same default as the debt ledger: absence must never mean "tolerate anything".
}

// A gate may not be in BOTH ledgers. They assert incompatible things — "somebody
// chose to ship this" and "nobody had ever measured this" — and a gate carrying
// both would be absorbed by whichever branch this runner happened to check first,
// which is a coin toss dressed as a policy.
const inBoth = [...newlyMeasured.keys()].filter((s) => baseline.has(s));
if (inBoth.length > 0) {
  console.error(
    `\n[ga-gate/run-all] ❌ ${inBoth.length} gate(s) are on BOTH gate-debt.json and gate-newly-measured.json:\n`
    + inBoth.map((s) => `    - ${s}`).join('\n')
    + '\n  DECLARED DEBT and NEWLY MEASURED are mutually exclusive claims. Pick one.',
  );
  process.exit(1);
}

// Every entry MUST carry an exit condition and a review date. This is not a schema
// nicety: the exit condition is the only thing separating this category from an
// amnesty, and BIM30-READINESS-GATES §2.3 / C70 §5.4 both turn on debt having a
// declared way out. An entry without one is rejected at load rather than tolerated
// at read time, so the file cannot acquire open-ended members by accident.
const incomplete = [...newlyMeasured.values()].filter((e) => !e.exitCondition || !e.reviewBy);
if (incomplete.length > 0) {
  console.error(
    `\n[ga-gate/run-all] ❌ ${incomplete.length} gate-newly-measured.json entr(ies) lack an exitCondition or a reviewBy:\n`
    + incomplete.map((e) => `    - ${e.gate}`).join('\n')
    + '\n  A category with no exit is how "temporary" becomes permanent. Name what makes'
    + '\n  the entry leave, and the date by which that must be re-argued.',
  );
  process.exit(1);
}

// §NEWLY-MEASURED-EXPIRES — the bound is enforced, or it is a comment.
// `reviewBy` is NOT a fix deadline. It is the date by which the entry must be
// RE-ARGUED: fixed and struck, or moved to gate-debt.json as an explicit founder
// decision to live with it. A category with no exit is how "temporary" becomes
// permanent, and this repo has enough evidence that an unenforced date is not a
// bound. Checked for EVERY entry including the ones this runner does not execute:
// a date is runner-agnostic even when a reading is not.
const today = new Date().toISOString().slice(0, 10);
const expired = [...newlyMeasured.values()].filter((e) => typeof e.reviewBy === 'string' && e.reviewBy < today);

const nowFailing: string[] = [];
const nowPassing: string[] = [];
const failedDebt: string[] = [];
const failedNewly: string[] = [];
const failedRatchet: string[] = [];
const failedMisconfigured: string[] = [];
const failedRegression: string[] = [];

// §MISSING-GATE-IS-NOT-DEBT (L-812) — a gate whose FILE does not exist is not a
// failing gate; it is a lie in the inventory. C01 §5 named five hard-fail gates
// (check-single-compose, ci-check-domain-purity, ci-check-no-direct-store-writes,
// intent-not-ui.test, ci-check-spans) that had never been written, and nothing
// noticed for fifteen months because nothing tried to run them. This loop is
// checked BEFORE any gate runs and is NOT eligible for the debt baseline —
// declaring debt against a file that does not exist is meaningless.
// §GATE-AUTHORED-BUT-UNWIRED (2026-08-11, C9) — the mirror of the check below.
// `missing` catches an INVENTORY ROW WITH NO FILE. This catches a FILE WITH NO
// INVENTORY ROW, which is the failure this repo keeps paying for: work that
// exists, is committed, and runs nowhere. `check-verb-liveness.ts` was committed
// on 2026-08-11 enforcing C16 §5.1 CA-21 and was registered in NOTHING — not this
// runner, not ci.yml, not package.json. A gate nobody runs is indistinguishable
// from a gate nobody wrote, except that it reads as coverage.
//
// TRACKED files fail; UNTRACKED ones are disclosed only, because an in-flight gate
// another agent has not finished is not yet a claim of coverage.
let inventoryFailed = false;
const registered = new Set(GATES.map((g) => g.script));
const onDisk = readdirSync(__dir).filter((f) => /^check-.*\.ts$/.test(f) && !registered.has(f));
if (onDisk.length > 0) {
  let tracked: string[] = [];
  try {
    tracked = spawnSync('git', ['ls-files', '--', 'tools/ga-gate'], { encoding: 'utf8' })
      .stdout.split('\n').map((s) => s.trim().split('/').pop() ?? '').filter(Boolean);
  } catch { /* no git ⇒ treat everything as untracked and merely disclose */ }
  const committed = onDisk.filter((f) => tracked.includes(f));
  const inFlight = onDisk.filter((f) => !tracked.includes(f));
  if (inFlight.length > 0) {
    console.warn(
      `\n[ga-gate/run-all] ⚠ ${inFlight.length} gate file(s) exist but are NOT registered (untracked / in flight):\n`
      + inFlight.map((f) => `    - ${f}`).join('\n')
      + '\n  They are NOT part of this run and prove nothing about this tree.',
    );
  }
  if (committed.length > 0) {
    console.error(
      `\n[ga-gate/run-all] ❌ ${committed.length} COMMITTED gate(s) are registered nowhere and therefore never run:\n`
      + committed.map((f) => `    - ${f}`).join('\n')
      + '\n  A gate that runs nowhere is not enforcement, it is a file. Register it in GATES'
      + '\n  above (with a debt line if it fails today) or delete it.',
    );
    // ⚠ RECORDED, NOT FATAL-HERE (2026-08-11, C9). The first draft called
    // process.exit(1) on the spot, and the very first run after another stream
    // committed a new gate aborted the ENTIRE suite before a single check ran —
    // forty gates' worth of signal destroyed by an inventory complaint. A gate
    // runner that stops reporting the moment it finds one problem teaches people
    // to stop running it, which is how this suite ended up unwired in the first
    // place (L-774). The failure is real and still blocks at the END.
    inventoryFailed = true;
  }
}

// §GATE-UNWIRED-ACROSS-TWO-HOMES (2026-08-12) — the check above has a blind spot,
// and it is exactly the size of the other gate home.
//
// `readdirSync(__dir)` reads `tools/ga-gate/` and NOTHING ELSE, so a gate file
// dropped into `tools/rac-conformance/certification/gates/` and registered in
// neither runner is invisible to every check in this repository. That is the
// §AUTHORED-BUT-UNWIRED hazard with the one instrument that detects it pointed at
// half the estate — and two homes means two registration points, so the hazard is
// strictly larger than it was when there was one.
//
// BIM30-READINESS-GATES §2.1 (as amended 2026-08-12) sets the residency rule; this
// is its enforcement. A file in either home must be registered in ONE of the two
// runners: this file's GATES array, or certify.ts's `gates` list. Registered in
// neither is a finding. Registered in BOTH is disclosed, not failed — it is
// wasteful rather than dishonest, and `check-propagation-reaches` is deliberately
// in both today (its file co-locates with the ledger it reads).
//
// The certify list is PARSED FROM SOURCE rather than duplicated here, because a
// hand-copied list is a list that rots — and a parse that finds nothing must be
// reported, never treated as "no gates registered there", which would fabricate
// findings the same way the compile gate fabricated passes.
const CERT_GATES_DIR = join(__dir, '../rac-conformance/certification/gates');
if (existsSync(CERT_GATES_DIR)) {
  const certFiles = readdirSync(CERT_GATES_DIR).filter((f) => /^check-.*\.ts$/.test(f));
  const certifyPath = join(__dir, '../rac-conformance/certification/certify.ts');
  let certRegistered: string[] = [];
  let parsedOk = false;
  if (existsSync(certifyPath)) {
    const src = readFileSync(certifyPath, 'utf8');
    const m = /const\s+gates\s*=\s*\[([\s\S]*?)\]/.exec(src);
    if (m) {
      certRegistered = [...m[1]!.matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]!);
      parsedOk = certRegistered.length > 0;
    }
  }
  if (!parsedOk) {
    console.error(
      '\n[ga-gate/run-all] ❌ Could not read certify.ts\'s gate registration list.'
      + '\n  This check cannot tell an unregistered certification gate from a parse failure,'
      + '\n  and reporting the second as the first would fabricate findings. Fix the parse'
      + '\n  (or the file) rather than letting this pass silently.',
    );
    inventoryFailed = true;
  } else {
    const runAllBasenames = new Set(GATES.map((g) => g.script.split('/').pop()!));
    const certBasenames = new Set(certRegistered.map((g) => (g.endsWith('.ts') ? g : g + '.ts')));
    const orphans = certFiles.filter((f) => !runAllBasenames.has(f) && !certBasenames.has(f));
    const both = certFiles.filter((f) => runAllBasenames.has(f) && certBasenames.has(f));
    if (both.length > 0) {
      console.log(
        `[ga-gate/run-all] ℹ ${both.length} certification gate(s) are registered in BOTH runners `
        + `(disclosed, not failed): ${both.join(', ')}`,
      );
    }
    if (orphans.length > 0) {
      console.error(
        `\n[ga-gate/run-all] ❌ ${orphans.length} gate file(s) under certification/gates/ are registered in NEITHER runner:\n`
        + orphans.map((f) => `    - ${f}`).join('\n')
        + '\n  Two gate homes means two registration points, and a gate in neither reads as'
        + '\n  coverage while running nowhere. Register it in certify.ts (executed gates) or in'
        + '\n  GATES above (static gates) — BIM30-READINESS-GATES §2.1 decides which.',
      );
      inventoryFailed = true;
    }
  }
}

const missing = GATES.filter((g) => !existsSync(join(__dir, g.script)));
if (missing.length > 0) {
  console.error(
    `\n[ga-gate/run-all] ❌ ${missing.length} GATE SCRIPT(S) DO NOT EXIST:\n`
    + missing.map((g) => `    - ${g.script}  (${g.name})`).join('\n')
    + '\n  An inventory entry with no file behind it is worse than an omission: it reads as'
    + '\n  coverage. Write the gate or delete the row — the debt baseline cannot excuse this.',
  );
  process.exit(1);
}

for (const gate of GATES) {
  const scriptPath = join(__dir, gate.script);
  const result = spawnGate(scriptPath);
  const code = result.status ?? 1;

  // §MISCONFIG-IS-NEVER-DEBT (L-811) — exit 2 means the gate could not evaluate
  // (unreadable root, empty walk, missing prerequisite). That is categorically
  // different from "the code is dirty", so it is NEVER absorbed by the debt
  // ledger. The whole ripgrep episode is what this clause exists to prevent: for
  // months three gates died with `spawnSync rg ENOENT` and their crash was
  // indistinguishable, to this runner, from the known failure they were
  // baselined for.
  if (code === 2) {
    nowFailing.push(gate.script);
    failedMisconfigured.push(gate.script);
    console.error(`\n[ga-gate/run-all] ❌ MISCONFIGURED (exit 2, never excusable as debt): ${gate.name}`);
    anyFailed = true;
    continue;
  }

  // §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7, L-836 · 2026-08-11) — exit 3 means a
  // SHRINK-ONLY RATCHET WAS EXCEEDED. Like exit 2, it is never absorbed by the
  // ledger.
  //
  // Being on gate-debt.json declares that a gate FAILS. It does NOT declare that
  // the gate may get WORSE. Until this clause existed the two printed
  // identically, so a ledgered gate silently licensed its own growth: the
  // repo-wide `(window as any)` count went 215 → 217 while sitting on the ledger
  // and no run ever said so. A shrink-only ratchet that can be exceeded without a
  // signal is not a ratchet — it is a number in a file.
  //
  // Only the gate knows its own baseline, and the ledger is keyed on gate NAME,
  // so this runner cannot tell "failing at its declared level" from "failing
  // worse" by itself. The gate has to say which, and the exit code is the only
  // channel this runner reads. Same reasoning as exit 2, one step further in.
  if (code === 3) {
    nowFailing.push(gate.script);
    failedRatchet.push(gate.script);
    console.error(
      `\n[ga-gate/run-all] ❌ RATCHET EXCEEDED (exit 3, never excusable as debt): ${gate.name}`
      + `\n  This gate is allowed to FAIL at its declared level. It is not allowed to get WORSE.`
      + `\n  Fix the new violations. Do NOT raise the threshold — that turns a measurement`
      + `\n  into a permission, which is the failure the ratchet exists to prevent.`,
    );
    anyFailed = true;
    continue;
  }

  if (code !== 0) {
    nowFailing.push(gate.script);
    // THREE STATES, THREE LABELS, and the whole point is that a reader can tell
    // "something broke" from "we started measuring something that was already
    // broken" without opening a file. If those two print the same, the category
    // has bought nothing.
    const newly = newlyMeasured.get(gate.script);
    if (baseline.has(gate.script)) {
      failedDebt.push(gate.script);
      console.error(`\n[ga-gate/run-all] 🟡 KNOWN-DEBT: ${gate.name} (exit ${code}) — somebody CHOSE to ship this (gate-debt.json).`);
    } else if (newly) {
      failedNewly.push(gate.script);
      console.error(
        `\n[ga-gate/run-all] 🔵 NEWLY-MEASURED: ${gate.name} (exit ${code}) — the instrument arrived; the defects predate it.`
        + `\n    first reading : ${newly.firstReading ?? '(not recorded — gate-newly-measured.json entry is incomplete)'}`
        + `\n    leaves when   : ${newly.exitCondition ?? '(NO EXIT CONDITION RECORDED)'}`
        + `\n    review by     : ${newly.reviewBy ?? '(NONE — an entry with no bound is how temporary becomes permanent)'}`
        + `\n    NOT a regression: nothing got worse. NOT declared debt: nobody chose this, it was never measured.`,
      );
    } else {
      failedRegression.push(gate.script);
      console.error(`\n[ga-gate/run-all] ❌ REGRESSION: ${gate.name} (exit ${code}) — not on any ledger. Something got WORSE.`);
      anyFailed = true;
    }
  } else {
    nowPassing.push(gate.script);
    console.log(`[ga-gate/run-all] ✅ PASSED: ${gate.name}`);
  }
}

// Shrink-only enforcement: a gate on the baseline that now passes MUST be removed.
// §GATE-AUTHORED-BUT-UNWIRED — recorded above, enforced here, so one inventory
// complaint can never suppress forty gates' worth of signal.
if (inventoryFailed) anyFailed = true;

const fixedButStillDeclared = [...baseline].filter((s) => nowPassing.includes(s));
if (fixedButStillDeclared.length > 0) {
  console.error(
    `\n[ga-gate/run-all] ❌ BASELINE IS STALE — ${fixedButStillDeclared.length} gate(s) now PASS but are still`
    + ' declared as debt. Remove them from tools/ga-gate/gate-debt.json:\n'
    + fixedButStillDeclared.map((s) => `    - ${s}`).join('\n')
    + '\n  (The ratchet only means anything if paid debt leaves the ledger.)',
  );
  anyFailed = true;
}

// The rule-2 discipline, applied to the second ledger. An instrument whose subject
// has been fixed must LEAVE this file, for exactly the reason gate-debt.json gives:
// otherwise it rots into a list of things that are secretly fine, and the next real
// finding hides inside it. Only entries this runner actually EXECUTED are graded —
// `runner: 'certify'` entries are not in GATES, so their absence from `nowPassing`
// says nothing about them.
const newlyFixed = [...newlyMeasured.values()]
  .filter((e) => (e.runner ?? 'ga-gate') === 'ga-gate' && nowPassing.includes(e.gate));
if (newlyFixed.length > 0) {
  console.error(
    `\n[ga-gate/run-all] ❌ ${newlyFixed.length} NEWLY-MEASURED entr(ies) now PASS but are still listed.`
    + ' Strike them from tools/ga-gate/gate-newly-measured.json:\n'
    + newlyFixed.map((e) => `    - ${e.gate}`).join('\n')
    + '\n  (Paid instrument debt leaves its ledger in the commit that pays it.)',
  );
  anyFailed = true;
}

if (expired.length > 0) {
  console.error(
    `\n[ga-gate/run-all] ❌ ${expired.length} NEWLY-MEASURED entr(ies) are PAST their reviewBy date (today ${today}):\n`
    + expired.map((e) => `    - ${e.gate}  (reviewBy ${e.reviewBy})`).join('\n')
    + '\n  This is the category expiring on purpose. Three legal outcomes, no fourth:'
    + '\n    1. fix the finding and strike the entry;'
    + '\n    2. move it to gate-debt.json — an explicit founder decision to live with it;'
    + '\n    3. the founder extends reviewBy, in writing, with the reason.'
    + '\n  Extending the date silently is how "we have not looked yet" becomes permanent.',
  );
  anyFailed = true;
}

// The summary is where the three states have to be legible at a glance, so it
// enumerates FIVE outcomes rather than the two it used to. The old line was also
// WRONG in a way worth recording: it computed "declared debt" as
// `nowFailing.filter(baseline.has)`, which counted a LEDGERED gate that exited 3
// as declared debt — the exact absorption §RATCHET-EXCEEDED-IS-NEVER-DEBT exists
// to refuse. The run printed "❌ RATCHET EXCEEDED: xss-sink-scan" and then tallied
// it under "declared debt" four lines later. Exit-3 and exit-2 now get their own
// columns and are never folded into either ledger's count.
console.log(
  `\n[ga-gate/run-all] ── ${nowPassing.length} passing · ${nowFailing.length} failing ──`
  + `\n[ga-gate/run-all]    🟡 ${failedDebt.length} declared debt      (gate-debt.json — somebody chose to ship it)`
  + `\n[ga-gate/run-all]    🔵 ${failedNewly.length} newly measured     (gate-newly-measured.json — the instrument arrived; nothing got worse)`
  + `\n[ga-gate/run-all]    ❌ ${failedRatchet.length} ratchet exceeded   (exit 3 — never absorbable by either ledger)`
  + `\n[ga-gate/run-all]    ❌ ${failedMisconfigured.length} misconfigured      (exit 2 — never absorbable by either ledger)`
  + `\n[ga-gate/run-all]    ❌ ${failedRegression.length} regression         (on no ledger — something BROKE)`,
);

// Entries this runner does not execute are disclosed, never counted. Claiming a
// verdict on a gate you did not run is the fabricating-compile-gate shape.
const elsewhere = [...newlyMeasured.values()].filter((e) => e.runner === 'certify');
if (elsewhere.length > 0) {
  console.log(
    `[ga-gate/run-all]    ℹ ${elsewhere.length} further newly-measured gate(s) are graded by certify.ts, NOT by this runner:\n`
    + elsewhere.map((e) => `[ga-gate/run-all]        - ${e.gate}  (reviewBy ${e.reviewBy})`).join('\n')
    + `\n[ga-gate/run-all]      Their reviewBy dates are enforced above; their readings are not this runner's to report.`,
  );
}

// ── INFORMATIONAL SECTION — convergence booleans (R4) ────────────────────────
// Not a PR gate. Booleans #7–#9 require external infrastructure (npm publish,
// marketplace DNS, Stripe webhook) — they will show FALSE until Phase F-3 human
// actions are complete. The suite always continues regardless of exit code.
// Recommendation: PRYZM3-FULL-AUDIT-2026-05-14 §25 R4 — informational post-deploy check.
console.log('\n[ga-gate/run-all] ── Informational: convergence booleans (R4) ──');
const convScriptPath = join(__dir, '../../scripts/check/check-pryzm3-exists.ts');
const convResult = spawnGate(convScriptPath);
if ((convResult.status ?? 1) !== 0) {
  console.log('[ga-gate/run-all] ℹ️  Some convergence booleans FALSE (infra-pending items #7–#9 expected).');
} else {
  console.log('[ga-gate/run-all] ℹ️  All 9 convergence booleans TRUE. ✅');
}
console.log('[ga-gate/run-all] ────────────────────────────────────────────────\n');

const GATE_COUNT = GATES.length;
const declaredDebt = failedDebt.length;
const newlyMeasuredCount = failedNewly.length;

if (anyFailed) {
  console.error(`\n[ga-gate/run-all] BLOCKED — a gate regressed, or the debt baseline is stale. Fix the above before merging.`);
  process.exit(1);
}

// ⚠ THIS MESSAGE MUST NOT SAY "ALL GREEN" WHILE GATES ARE FAILING.
// The pre-ratchet version printed "All 25 gates green ✅" on exit 0, which after
// the ratchet landed would have been a lie: 16 gates fail, they are merely
// TOLERATED. Reporting tolerated debt as success is the §CONTEXT-DATA-HONESTY
// failure this repo keeps paying for — it is how the 16 became invisible in the
// first place. Exit 0 here means "no REGRESSION", never "no problems".
if (declaredDebt > 0 || newlyMeasuredCount > 0) {
  console.log(
    `\n[ga-gate/run-all] ✅ NO REGRESSION — ${nowPassing.length}/${GATE_COUNT} gates pass.`
    + (declaredDebt > 0
      ? `\n[ga-gate/run-all] ⚠ ${declaredDebt} gate(s) FAIL as DECLARED DEBT (tools/ga-gate/gate-debt.json) — chosen, and tolerated.`
      : '')
    + (newlyMeasuredCount > 0
      ? `\n[ga-gate/run-all] ⚠ ${newlyMeasuredCount} gate(s) FAIL as NEWLY MEASURED (tools/ga-gate/gate-newly-measured.json) —`
        + `\n[ga-gate/run-all]   pre-existing defects that nothing was measuring until the gate landed. Pinned, shrink-only,`
        + `\n[ga-gate/run-all]   and each one names what makes it leave the category.`
      : '')
    + `\n[ga-gate/run-all]   C01 §5 requires ALL gates to pass. That is not yet true — this run did not verify it.`,
  );
} else {
  console.log(`\n[ga-gate/run-all] All ${GATE_COUNT} gates green, zero declared debt. ✅ C01 §5 satisfied.`);
}
process.exit(0);
