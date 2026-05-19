I've got the full picture. Here is the analysis you asked for, broken into the four areas you raised.

1. Why publishing fails at the Promote step
The publish pipeline goes Provision → Security Scan → Build → Bundle → Promote. Build/Bundle pass (your second screenshot shows the image layers being pushed cleanly), but Promote is the stage where Replit boots the bundled artifact and checks it answers a health check. That is where it dies.

The deployment logs in your screenshots show the smoking gun, and I just reproduced it locally:

TypeError [ERR_UNKNOWN_FILE_EXTENSION]:
  Unknown file extension ".ts"
  for /home/runner/workspace/packages/runtime-composer/src/index.ts
  at Object.getFileProtocolModuleFormat (node:internal/modules/esm/get_format:189:9)
  ...
crash loop detected

Root cause — what the build produces vs what production runs:

The npm run build script writes a dist/index.cjs shim that does:
spawn(node, [path.join(__dirname, '../server.js')])

i.e. it launches plain node server.js with no TypeScript loader.
server.js imports from workspace packages:
import { ... } from '@pryzm/file-format';

and the runtime-composer chain pulls in @pryzm/runtime-composer/src/index.ts, @pryzm/persistence-client/src/index.ts, @pryzm/stores/src/index.ts, etc.
Every one of those packages declares "main": "./src/index.ts" — there is no compiled dist/*.js for any @pryzm/* workspace package. We import TypeScript source at runtime.
In dev that is fine because the dev script is node --import tsx server.js (tsx transpiles .ts on the fly). In production the spawn is bare node, so the first import '@pryzm/...' blows up with ERR_UNKNOWN_FILE_EXTENSION ".ts". Replit retries it for ~10 s, sees the crash loop, and refuses to promote.
Two ways to unblock publishing — I am not applying either yet, your call:

Path	What it costs	What it gives
A — Quick fix. Promote tsx from devDeps to deps and change the spawn line in package.json build to spawn(process.execPath, ['--import','tsx','...']) so production also boots through tsx.	5 min change. Adds ~9 MB tsx to the prod image. tsx parses .ts on every cold start, so cold-boot time goes up ~150–300 ms.	Publish works today.
B — Proper fix (the PRYZM 2 way). Add a tsc -b build step for every @pryzm/* workspace package, point each package.json's main/exports at ./dist/index.js with a dual ./src/* for dev. The root npm run build runs pnpm -r build first, then the existing Vite step, then writes dist/index.cjs.	1–2 days, plus ~15 package.json edits, plus a tsconfig refit per package.	Production runs prebuilt JS, no tsx in the image, cold start matches the §6 target's ballpark. This is the path implied by §10 of the master plan and is part of the GA exit gates.
Tell me A or B and I will execute. If you say "decide", I would do A today (so you can publish) and file B as Phase H ground work.

2. Landing / Sign in / Log in / Open project / Create project — current state
I verified this in dev (the production environment is broken per §1 above):

Flow	Status
Landing page render (/)	Renders cleanly, no console errors, FPS ~60. Network/transit OK.
Server boot	[server] Running on port 5000, JWT/bcrypt auth ON, Socket.io ON, Anthropic ping OK, Postgres pool initialised.
/api/v1/... auth endpoints	Mounted (buildAiPublicApiRouter, stripeRouter, versionStateMachine, etc. all attach).
Sign in / Log in	Backed by server/planStore.ts + JWT — log shows [planStore] Loaded plan for user-1777463992386-e8uz0y7: free, so prior session restored OK.
Open project	[PlatformShell] Initialized — project ID: proj-…-… (runtime: composed) then [bootPlatform] D.1 — early PlatformShell created (delegates: deferred). Runtime composes successfully on every boot.
Create project	The dbMigrate schema applies cleanly so the projects table is ensured every boot; ProjectListClient.test.ts (16/16) and in-memory-backend.test.ts (6/6) pass against the same client used by the UI.
Landing-page "timeout" — I did not see one in the current logs; the page renders inside the screenshot tool's 5 s budget. If you are seeing a timeout in your browser, the most likely cause right now is the Vite dev server re-optimising dependencies the first time you load after pnpm install --force (the boot log explicitly shows [vite] (client) Re-optimizing dependencies because lockfile has changed). This is one-shot — it should not recur after the next reload. Ping me if it does.

3. Planned vs current state (against the 8 wireup phases)
Reading PROCESS-TRACKER.md §3 against what is actually merged:

Phase	Plan (S72)	Today	Gap
A — composition root	7 sub-phases	7 / 7 done	None. Composer wires the full 18-slot runtime.
B — panel ctor widening, kill (window as any) under src/ui/	40 sub-phases, baseline floor 2 080 reaches	1 / 40 (only B.1, the Panel base class). (window as any) count = 778 vs floor 767 — still above gate.	39 sub-phases. This is the bulk of the work.
C — command-bus binding (264 handlers) + plan view	C.1–C.14	C.1 ✅ ProjectHub uses runtime.persistence.client. C.2–C.14 not started.	13 sub-phases.
D — persistence + sync binding, kill the ?pryzm2=1 branch	4 sub-phases	D.1 + D.2 done — kill-switch deleted, src/main.ts is 256 LOC. D.3 / D.4 not done.	2 sub-phases.
E — 13 element-family bindings (gesture-route + bus-dispatch + legacy-delete each)	18 sub-phases × 3 = 54 cells	gesture routing 15 / 18, bus-dispatch 0 / 18, legacy-deletion 0 / 18	39 cells.
F — view / section / visibility + AI plugins	13 + F.7.*	First cut just landed today (S81-WIRE): 18-slot runtime, AiSlot/PluginsSlot promoted, four lazy I/O facades, 38-plugin static catalog, status pill in the shell. The real F.8 sub-phases (sections, visibility waves, view templates) not started.	F.7 surface live, F.8 unwired.
G — PRYZM 1 deletion (178 sub-phases)	S82–S84	Not started. PRYZM 1 still runs in parallel under the dev shell.	178.
H — verification lock-in / hand-off	S85–S87	Not started.	All.
So: A + first slices of B/C/D/E/F are landed, G + H untouched, PRYZM 1 still co-resident. That single fact is the entire reason the §6 numbers haven't moved yet — see next section.

4. Why performance is nowhere near the §6 targets
The 17 contracts in §6 (cold load 800 ms, save 10 ms, undo 5 ms, bundle 1.8 MB gzip, FCP 600 ms, etc.) are GA, Month 36 numbers. They are gated by architectural changes that have not been turned on yet. The bench infrastructure is in place — apps/bench/src/benches/ already has cold-load-real.bench.ts, idle-cpu.bench.ts, bake-incremental.bench.ts, awareness-throughput.bench.ts, largest-model.bench.ts, cmd-execute-latency.bench.ts, etc. — but the systems they measure are mostly Phase G/H deliverables. Concretely:

§6 row	Target	Why the dial hasn't moved yet
Cold load small / medium / large	0.8 s / 1.5 s / 3 s	Current load path is PRYZM 1: full JSON snapshot, browser-thread parse, eager bootstrap.everything. The MessagePack event log + per-level glb chunks + tier-streamed loader are landed in packages/persistence-client (144/144 tests pass), but the editor is not yet reading from them — that is C and E.2–E.5.
Save (single edit) — 10 ms	Same — handlers still call full snapshot POST. The Immer-patch + event-append path exists in packages/runtime-undo-stack and packages/persistence-client but the 264 src/commands/ handlers haven't been migrated. That is the body of Phase C.	
Undo — 5 ms	Same reason — the Immer patch undo stack is built; commands still use structuredClone.	
Idle CPU — 2 %	Frame scheduler exists in @pryzm/frame-scheduler, but the scene still runs the PRYZM 1 continuous-render loop (D.3 wires scene.scheduler into the renderer).	
Interactive frame rate — 55 fps	Same. Boot logs currently show ~60 fps after warm-up and 1 fps when idle, but that 1 fps is on the landing page (no scene). In a project the PRYZM 1 RAF loop kicks in.	
Bundle size — 1.8 MB gzip	Vite is producing the bundle that includes both PRYZM 1 + the parallel PRYZM 2 wireup + the 18-slot runtime + all 38 plugins eagerly imported. The plan's 1.8 MB number assumes G.* deletes PRYZM 1 and F.* keeps the plugin host lazy. We're carrying both engines today.	
FCP — 600 ms	Dev mode — Vite cold-transforms ~3 000 modules on first request. Production FCP is the meaningful number, and right now production won't even boot (see §1).	
Concurrent users — 20 reliable	CRDT/Yjs sync layer is apps/sync-server skeleton; the editor still uses Socket.io broadcast (last-writer-wins). This is L3 — Phase G.13–G.20.	
Bake — 1.5 s, AI floor-plan — 15 s	apps/bake-worker and apps/ai-host are scaffolded; bake CI bench passes (bake-incremental.bench.ts) but the editor doesn't enqueue bakes yet.	
One-line summary of perf: today we are at the PRYZM 1 baseline column of §6 (2.4 s small load, 380 ms save, 18 % idle CPU, 28 fps orbit, 14 MB / 4.1 MB bundle). That is expected at this point in the plan — the GA column lights up phase by phase as B/C/D/E/F/G land. The honest tracker today would say:

Bench rows passing: bake-incremental, sync-latency (synthetic), undo (synthetic, against the new stack), persistence chunk round-trip (272 tests).
Bench rows still on the As-Is column: every editor-facing user-visible row, because the editor is still on PRYZM 1.

What I propose next
Tell me which one of these you want and I will run it now:

Unblock publishing now — I do path A above (tsx-at-runtime), redeploy, and confirm Promote goes green. ~10 minutes.
Unblock publishing properly — I scope path B (per-package compile) as a Phase H ticket and start the package-by-package conversion. ~1–2 days.
Continue Phase F — second cut: F.8.1–F.8.3 (visibility waves wired into the runtime so the §6 visibility-update row starts measuring real numbers).
Start Phase B in earnest — the 39 remaining (window as any)-removal sub-phases that drive the lint floor down toward zero, which is what will eventually let us delete PRYZM 1 in Phase G.
I'd recommend doing 1 today (so you can publish at all), and then either 3 or 4 depending on whether you want visible feature progress (3) or invisible-but-mandatory floor work (4).