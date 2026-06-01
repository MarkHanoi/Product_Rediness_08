# PRYZM 4 — Next-Generation Plan (zero-base, designed-from-scratch)

> **The "no compromises" doc.** Defines the from-zero next-generation product that follows after the PRYZM 1 + PRYZM 2 → PRYZM 3 wireup convergence has been completed and **proven in production with real customers for at least six months**. PRYZM 4 is **not** a refactor of PRYZM 3 — it is a designed-from-scratch product that absorbs every lesson PRYZM 3 teaches and discards every compromise PRYZM 3 had to make.
>
> **Status**: drafted 2026-04-29, ratified pending PRYZM 3 GA + Σ.exit decision gate at ~M48.
> **The endpoint**: PRYZM 4 = best-in-class UI/UX + best-in-class architecture + multi-shell (web + native + mobile + spatial) + AI-as-substrate + full BIM Phase 4–8 features + WCAG 2.2 AAA + sovereignty-first + designed-from-zero in every line of code.
> **Calendar target**: PRYZM 4 GA ~ **S155 (~M77, ~end of year 7 from project start)**.
> **Authority**: this doc is **authoritative for the PRYZM 4 program**. The white UI freeze, the 36-month plan, the wireup chunks, the convergence checklist all stay authoritative for PRYZM 1 → 2 → 3. PRYZM 4 supersedes all of them on its own GA day.
>
> **Companion docs**:
> - [`PRYZM-3-CONVERGENCE-PLAN.md`](./PRYZM-3-CONVERGENCE-PLAN.md) — what PRYZM 3 is and how the wireup gets there
> - [`FINAL-ARCHITECTURE-AND-ORCHESTRATION.md`](./FINAL-ARCHITECTURE-AND-ORCHESTRATION.md) — the PRYZM 3 architecture map (the foundation PRYZM 4 builds on)
> - [`SUMMARY-IMPLEMENTATION-PLAN.md`](./SUMMARY-IMPLEMENTATION-PLAN.md) — extended below to cover Stages Σ + α + β + γ + δ
> - [`PROCESS-TRACKER.md`](./PROCESS-TRACKER.md) — the live status board (PRYZM 4 stages are added once Σ opens)

---

## §1  The three-stage mega-arc

The story from today (S76, mid-Phase-C of PRYZM 2 wireup) to PRYZM 4 GA is a **three-stage arc spanning ~64 sprints (~32 months from now, ~M77 from project start)**:

```
NOW ─────────► PRYZM 3 GA ─────────► PRYZM 3 PROVEN ─────────► PRYZM 4 GA
S76 (M37)      S87 (M40)             S99 (M48)                  S155 (M77)

│              │                     │                          │
│ Stage Ω      │ Stage Σ             │ Stage α + β + γ + δ      │
│ (Wireup)     │ (Validation)        │ (PRYZM 4 build)          │
│ 11 sprints   │ 12 sprints          │ 56 sprints               │
│ ~5 months    │ ~6 months           │ ~28 months               │
│              │                     │                          │
└──────────────┴─────────────────────┴──────────────────────────┘
```

Each stage has a hard gate the previous one must pass. **No stage starts until the previous stage's exit gate is green.** This is the discipline that prevents the from-zero rebuild from happening on top of an unproven foundation.

| Stage | Name | Purpose | Sprint window | Exit gate |
|---|---|---|---|---|
| **Ω** | Wireup completion | Finish PRYZM 2 → PRYZM 3 convergence | S76 → S87 | `pnpm pryzm-3-day-1` exits 0 (per [`PRYZM-3-CONVERGENCE-PLAN.md §6`](./PRYZM-3-CONVERGENCE-PLAN.md)) |
| **Σ** | Production validation | Prove the architecture holds under real customers | S88 → S99 | §3 below — 12 hard criteria |
| **α** | PRYZM 4 design genesis | Designer-led from-zero product design | S100 → S111 | §6 below — design freeze |
| **β** | PRYZM 4 architecture genesis | Architect-led from-zero technical design (overlaps with α) | S106 → S117 | §7 below — architecture freeze |
| **γ** | PRYZM 4 build | Full implementation | S118 → S145 | §8 below — feature complete |
| **δ** | PRYZM 4 migration + GA | PRYZM 3 → PRYZM 4 customer migration + cutover | S146 → S155 | §9 below — PRYZM 3 sunset complete |

---

## §2  Stage Σ — Production validation (S88 → S99, 12 sprints, 6 months)

**The single most important stage.** PRYZM 3 must run in production with paying customers for six months before PRYZM 4 design begins. Without this, PRYZM 4 design is guesswork; with it, PRYZM 4 is informed by real workflows, real failures, real customer language, real perf data, real third-party plugin needs.

### §2.1  What "the architecture works" actually means (the 12 production criteria)

Not "CI is green" — that's the Stage Ω gate. **Stage Σ exit means**:

| Criterion | Threshold | How proven |
|---|---|---|
| **Σ.1** Concurrent-user load holds | sync-server holds 200+ concurrent users in 1 project, p95 latency ≤ 100 ms | [SPEC-31](./specs/SPEC-31-LOAD-BENCH-AND-BACKPRESSURE.md) extended; weekly load drill |
| **Σ.2** Real customer files import cleanly | 50 real IFC files from 10+ customers round-trip with ≤ 1 % data loss | Customer-supplied corpus; tracked in `apps/bench/src/benches/ifc-real-corpus/` |
| **Σ.3** AI delivers measured value | ≥ 30 % time savings on 5 named workflows, measured per-customer via session telemetry | OTel events + customer interviews |
| **Σ.4** Plugin SDK scales to third parties | ≥ 5 third-party plugins published by external authors with ≤ 1 SDK breaking change | Marketplace metric |
| **Σ.5** Perf budget holds on real projects | 1000-element project edits at 60 fps p95; load < 5 s; export < 30 s | [SPEC-30](./specs/SPEC-30-PLAN-VIEW-PERFORMANCE.md) on real customer corpus |
| **Σ.6** Disaster recovery proven | Quarterly DR drill: full restore from S3 backup, RTO ≤ 30 s, RPO ≤ 5 s | DR runbook + drill log |
| **Σ.7** Chaos engineering proven | Weekly chaos drill: kill sync-server / corrupt CRDT / throttle bandwidth → no data loss | `apps/chaos/` + drill log |
| **Σ.8** Customer base is real | ≥ 100 paying users + ≥ 3 enterprise pilots in active conversation | Stripe + Plain |
| **Σ.9** Customer-driven roadmap exists | ≥ 30 customer-driven feature requests landed; ≥ 100 in backlog with priority signals | Linear + customer interviews |
| **Σ.10** SOC2 Type 1 attested | Drata or Vanta attestation complete | Auditor letter |
| **Σ.11** WCAG 2.2 AA verified by external auditor | All §11 click trails pass external accessibility audit | Auditor report |
| **Σ.12** Lessons-learned doc authored | "What we'd do differently" doc covering UX, architecture, ops, customer fit | `docs/archive/pryzm3-internal/PRYZM-3-LESSONS-LEARNED.md` |

### §2.2  Stage Σ sub-phases

| Sub-phase | Deliverable | Lands by |
|---|---|---|
| **V.1** | Recruit 50 paying alpha customers (founder-led, design-partner program) | S88 D5 |
| **V.2** | Production telemetry baseline (12 weeks of OTel data on real workloads) | S91 |
| **V.3** | Land first 30 customer-driven features (fast iteration cycles, weekly releases) | S88 → S99 (rolling) |
| **V.4** | Onboard 5 third-party plugin authors; SDK feedback loop closed | S94 D5 |
| **V.5** | Run 12 chaos engineering drills + 3 disaster recovery drills | S88 → S99 (rolling) |
| **V.6** | buildingSMART IFC4 cert pre-audit on real customer files | S96 D5 |
| **V.7** | **Hire** 1 senior FE designer-engineer + 1 senior BE engineer + 1 senior product designer + 1 UX researcher (4 hires) | S88 → S91 |
| **V.8** | 200-user sustained-load test on sync-server | S98 D5 |
| **V.9** | Customer interviews → "PRYZM 4 design brief" (40+ interviews, ethnographic depth) | S97 → S99 |
| **V.10** | Architecture lessons-learned audit (`PRYZM-3-LESSONS-LEARNED.md`) | S99 D5 |
| **V.11** | SOC2 Type 1 attestation complete | S99 D7 |
| **V.12** | **Σ exit decision gate** — go/no-go on PRYZM 4 build (founder + architect + designer + 3 customers signing off) | S99 D9 |

### §2.3  What goes into Stage Σ that wasn't in the wireup plan

- **Real customers paying real money** — not alpha cohort, not free-forever; the validation is "would a real human pay for this?"
- **Real customer files** — IFC files from real projects, not the synthetic test corpus
- **Real third-party plugin authors** — 5 external authors who will write code against the SDK and tell you what hurts
- **Real SOC2 prep** — Drata or Vanta from S88, attestation by S99
- **Real accessibility audit** — external auditor (Deque, Level Access), not internal lint
- **Real DR drills** — restore from production backup, time it, document it
- **Real chaos drills** — kill production services in a sandboxed copy, observe, fix
- **Real customer-driven prioritization** — 30 features landed *because customers asked*, not because the SPEC said so

---

## §3  Decision gate Σ.exit → α.entry

**Σ.exit is a single meeting** with the following present:
- Founder
- Senior staff engineer (hired in V.7)
- Senior product designer (hired in V.7)
- 3 paying customers (rotating)
- 1 external advisor (board member, mentor, or peer founder)

**Outcome**: ratify one of three paths:

| Path | When chosen | What happens next |
|---|---|---|
| **A — Go for PRYZM 4** | All 12 Σ criteria green; customer signal strong; team capacity present | Stage α opens S100 D1 |
| **B — Continue PRYZM 3 evolution** | Customer signal strong but architecture lessons modest; PRYZM 4 risk too high | Skip to Stage P (extended PRYZM 3 product evolution); PRYZM 4 deferred to S160+ |
| **C — Pivot** | Customer signal weak; PRYZM 3 hasn't found product-market fit | Pause both PRYZM 3 evolution and PRYZM 4; founder repositions |

This document plans **Path A**. The other paths are not failures; they are honest reads of reality.

---

## §4  PRYZM 4 design principles (the 12 from-zero pillars)

PRYZM 4 is **designer-led**. Every screen is a Figma prototype before any code is written. Every interaction is voice + sketch + AI + traditional input from day 1. Every shell (web + native + mobile + spatial) is first-class from day 1.

### §4.1  The pillars

1. **Designer-led, not engineer-led** — every screen ships from Figma → Storybook → production. UI is the source of truth; engineers implement against approved designs. No "we'll polish later".
2. **Multimodal-native from day 1** — voice (Whisper-class STT + LLM verb resolution), sketch (free-hand → vector → recognition), AI prompt (Cmd-K + ambient suggestions), keyboard, mouse, touch, gesture. All input modes equally supported.
3. **Spatial-first** — Apple Vision Pro and Meta Quest 4+ are first-class targets. AR markup on iPad. The 3D model is **the product**; the 2D plan is one of many representations.
4. **Real-time multiplayer-native** — Figma-class. Live cursors with names. Follow-mode. Voice-in-app per project. Comments threaded inline. Not "we have CRDT" — "you can see what your colleague is doing right now".
5. **Local-first, sync-second** — works fully offline. Syncs when online. Never blocks on network. Service worker + IndexedDB + Origin Private File System.
6. **AI-as-substrate** — AI is L0, not L7.5 above. Every action has an AI counterpart. Every state is AI-introspectable. The OS is the AI.
7. **WCAG 2.2 AAA + ISO 30071 inclusive design from day 1** — not an audit at the end; an architectural constraint at the start.
8. **Sustainable by design** — green-software-foundation patterns. Carbon-aware compute scheduling. Low-carbon hosting regions default. Eco-mode for long-running bakes.
9. **Open by design** — IFC4.3 + USD + glTF + STEP + OBJ + DXF + DWG all first-class on equal footing. No "import/export" — there is no native format that isn't also a public format.
10. **Sovereignty default** — multi-region from day 1, BYOK default for enterprise, customer keys mandatory for any data classified as sensitive. Self-host as a first-class deployment option.
11. **Plugin = product** — even in v1, every feature except the geometry kernel is a plugin. The product eats its own dog food. Marketplace is the distribution channel even for first-party features.
12. **Bench-first** — every feature ships with a bench. PR cannot merge without a bench. Perf budgets enforced at PR-time, not "post-launch optimization".

### §4.2  What PRYZM 4 is NOT

- **Not a port of PRYZM 3** — visual identity, interaction model, information architecture all rethought from zero.
- **Not "white UI v2"** — the white UI is preserved historically (`apps/editor-classic/`) but PRYZM 4 has its own design language.
- **Not "PRYZM 3 + Vision Pro support"** — spatial is rethought from the ground up, not bolted on.
- **Not "PRYZM 3 + new design system"** — the design system is the entry point, not the chrome on top.

---

## §5  PRYZM 4 architecture principles (the 10 from-zero pillars)

The PRYZM 3 architecture works; PRYZM 4 architecture **inherits its concepts** (composition root, plugin model, single rAF, CRDT event log, layered structure) but **rewrites every line of code**. The lessons from Stage Σ inform every choice.

### §5.1  The pillars

1. **Single composition root** (kept; proven). One `composeRuntime()` per shell.
2. **Layered architecture L0–L8** (kept; redrawn). L0 is now AI substrate (was L7.5). L1–L8 below it.
3. **Plugin SDK v2** (rewritten). Stable v1 API with semver, compat shims, deprecation cycles, automated migration lints. Treat plugin API like a public REST API.
4. **Single rAF, single canvas per shell** (kept; proven). Per-shell because mobile + spatial have different frame budgets.
5. **CRDT event log v2** (rewritten). Conflict UX is a first-class design problem this time. Operational transforms where CRDT is wrong tool.
6. **Type-safe everywhere** (escalated). Effect-style branded types. No `as any`. No `unknown` without runtime validation. Type errors are bugs.
7. **Bench-first** (escalated). Every PR includes a bench. CI fails without one. Mandatory.
8. **Offline-first** (new). Service worker + IndexedDB + OPFS + WebTransport. Never assumes network.
9. **Multi-shell from day 1** (new). Web + native (Tauri 2) + mobile (React Native + Skia) + spatial (visionOS + Quest). Single composition root, four shells.
10. **AI-first runtime** (new). AI host is L0. Every leg of the runtime exposes typed introspection to the AI. Every command bus message is AI-replayable.

### §5.2  Technology choices (informed by 6 months of PRYZM 3 lessons)

These are **drafts** — Stage β ratifies them as PRYZM 4 ADRs. Recorded here as the current best guesses:

| Layer | PRYZM 3 (today) | PRYZM 4 (planned) | Why change |
|---|---|---|---|
| Geometry kernel | TypeScript | **Rust + WASM** | 3–10× perf, deterministic |
| Renderer | three.js (WebGL2) | **WebGPU first, WebGL2 fallback** | Compute shaders, 4× GPU throughput |
| Sync | Yjs CRDT | **Yjs v14 or Loro** | Smaller payloads, conflict UX |
| Local-first storage | IndexedDB | **OPFS + IndexedDB** | 10× faster blob storage |
| AI host | OpenAI/Anthropic SDK adapter | **Vercel AI SDK + multi-provider** | Vendor portability |
| Plugin sandbox | iframe + postMessage | **WASM component model** | Capability-based security |
| UI primitives | Vanilla TS + DOM | **Solid.js or Svelte 5 runes** | Fine-grained reactivity, no virtual DOM |
| Build | Vite + pnpm workspaces | **Turbo + Rspack + pnpm** | 5× faster builds |
| Type system | TypeScript strict | **TypeScript + Effect** | Effect-style errors, no exceptions |
| Mobile | n/a | **React Native + Skia** | Native canvas, code-share |
| Native desktop | n/a | **Tauri 2** | 3 MB binary, web codebase |
| Spatial | n/a | **visionOS native + WebXR for Quest** | Best-in-class spatial UX |

---

## §6  Stage α — Design genesis (S100 → S111, 12 sprints, 6 months)

**Pure design + UX research. Zero production code.** Outputs are Figma files, design system tokens, motion specs, voice prompts library, AR interaction patterns, accessibility specs, brand identity refresh.

### §6.1  Sub-phases

| Sub-phase | Deliverable | Lands by |
|---|---|---|
| **α.1** | Design team in place (1 senior product designer + 1 UX researcher hired in V.7) | S100 D1 |
| **α.2** | 8-week ethnographic research with 30 customers (architects, builders, engineers, BIM coordinators, owners) | S104 D5 |
| **α.3** | Information architecture v2 (project tree, layers, sheets, schedules, AI agents, marketplace) | S105 D5 |
| **α.4** | Design system v2 from zero — tokens (OKLCH-based), components (Radix-based), motion (Motion One), voice prompt library, AR interaction patterns | S107 D5 |
| **α.5** | High-fidelity Figma prototypes per surface — landing, hub, editor, wall, IFC, AI substrate, marketplace, mobile, spatial. Clickable + voice-narrated + AR-walkable. | S109 D5 |
| **α.6** | 6-week customer validation — 50 user tests per prototype; iterate to v3 | S110 D5 |
| **α.7** | Accessibility spec ratified — WCAG 2.2 AAA + ISO 30071 inclusive design + screen-reader semantics for canvas | S110 D8 |
| **α.8** | Visual identity refresh — logo (multi-mark), type stack, color (OKLCH derived), illustration system, marketing site design | S111 D5 |
| **α.9** | UI inventory v2 — every surface, every gesture, every state, every error path enumerated | S111 D7 |
| **α.10** | Design freeze — Storybook published; PRYZM 4 design becomes immutable for Stage γ | S111 D9 |
| **α.11** | Designer + UX researcher pair joins Stage γ as embedded design owners (not handoff-and-leave) | S111 D10 |
| **α.exit** | Founder + architect + designer + 5 customers ratify the design freeze | S111 D10 |

### §6.2  What gets locked in α

- Token system (color, type, space, motion, density)
- Component library (every primitive, every composite)
- Voice prompt library (every verb, every parameter, every confirmation pattern)
- AR interaction patterns (every gesture: pinch, gaze, voice + gesture combo)
- Information architecture (where every concept lives)
- Visual identity (brand, logo, illustration, photography)
- Marketing site design

---

## §7  Stage β — Architecture genesis (S106 → S117, 12 sprints, 6 months — overlaps with α last 6 sprints)

**Pure architecture + reference implementation. Limited production code (prototypes only).** Outputs are PRYZM 4 ADRs (numbered from PR4-001), PRYZM 4 SPECs (numbered from PR4-001), reference architecture, build system, CI scaffolding, the first vertical slice (one wall element, draw → save → load → edit → render → sync).

### §7.1  Sub-phases

| Sub-phase | Deliverable | Lands by |
|---|---|---|
| **β.1** | Architect (senior staff engineer) in place (hired in V.7) | S106 D1 |
| **β.2** | PRYZM 3 lessons-learned audit deeply absorbed; what worked / what didn't / what we'd do differently | S107 D5 |
| **β.3** | 12 from-zero pillar ADRs ratified (PR4-001 through PR4-012 — the §5.1 pillars become formal decisions) | S109 D5 |
| **β.4** | Reference architecture diagram v2 — L0 (AI substrate) through L8 (shells), every leg | S110 D5 |
| **β.5** | Technology choice ADRs ratified (PR4-013 through PR4-024 — the §5.2 table becomes formal decisions) | S111 D5 |
| **β.6** | First 20 SPECs (PR4-SPEC-001 through PR4-SPEC-020) — geometry kernel, renderer, sync, plugin SDK, AI substrate, runtime contracts, bench framework, build system, multi-shell composition, accessibility, security, sovereignty | S114 D5 |
| **β.7** | Build system bootstrapped — Turbo + Rspack + pnpm workspaces; CI scaffolding; bench framework | S115 D5 |
| **β.8** | Vertical slice prototype — one wall element from draw → save → load → edit → render → sync, in all four shells (web + native + mobile + spatial). End-to-end proof. | S116 D5 |
| **β.9** | Plugin SDK v2 reference + first reference plugin (a wall plugin) | S117 D3 |
| **β.10** | AI substrate reference — L0 layer, runtime introspection API, command-bus AI-replay | S117 D5 |
| **β.11** | Architecture freeze — every PRYZM 4 ADR + SPEC ratified; vertical slice merged | S117 D7 |
| **β.exit** | Founder + architect + designer + 3 third-party plugin authors review the vertical slice; ratify Stage γ opening | S117 D9 |

### §7.2  What gets locked in β

- 12 pillar ADRs (PR4-001 through PR4-012)
- 12 technology ADRs (PR4-013 through PR4-024)
- 20 SPECs (PR4-SPEC-001 through PR4-SPEC-020)
- Build system + bench framework + CI scaffolding
- Vertical slice (one wall in four shells, end-to-end)
- Plugin SDK v2 + reference plugin
- AI substrate L0 + runtime introspection API

---

## §8  Stage γ — Build (S118 → S145, 28 sprints, 14 months)

**Full implementation.** Designer + architect + 4–6 engineers (2 hired before γ.1; 2 more by γ.10). Every PR includes a bench. Every PR passes the visual-diff against the locked Storybook. Every PR has a SPEC ID. Every PR has an ADR if it changes a decision.

### §8.1  Track structure (parallel)

Stage γ runs **5 parallel tracks**, each owned by 1 engineer + designer pairing where applicable:

| Track | Owner type | Sprints | Deliverable |
|---|---|---|---|
| **γ-Foundation** | Architect + 1 senior eng | S118 → S128 | Geometry kernel (Rust+WASM), renderer (WebGPU), runtime, composition root, sync (Yjs v14 or Loro), local-first storage (OPFS), build system, CI |
| **γ-Plugins** | 1 senior eng | S122 → S140 | Plugin SDK v2 + first 12 first-party plugins (wall, slab, door, window, roof, stair, opening, column, beam, ceiling, floor, furniture) |
| **γ-Shells** | 1 senior FE + designer | S124 → S140 | Web shell + native shell (Tauri 2) + mobile shell (RN+Skia) + spatial shell (visionOS + WebXR) |
| **γ-AI** | 1 senior eng | S120 → S138 | AI substrate L0 + Cmd-K + ambient suggestions + voice + AI-as-OS |
| **γ-BIM-features** | 1 senior eng + customer signal | S128 → S145 | All BIM Phase 4–8 features from zero (CDE, COBie, federated clash, MEP, IFC4 cert, 4D-5D, analysis bridge, LCA, cloud baked rendering) — informed by Σ.9 customer roadmap |

### §8.2  Sub-phases (high-level — full breakdown in PRYZM 4 wireup plan, authored S117 D8)

| Sub-phase | Deliverable | Lands by |
|---|---|---|
| **γ.1** | Monorepo bootstrap; first commit on PRYZM 4 codebase | S118 D1 |
| **γ.2** | Geometry kernel v2 (Rust + WASM) feature-complete | S125 D5 |
| **γ.3** | Renderer v2 (WebGPU) feature-complete | S128 D5 |
| **γ.4** | Persistence + sync v2 (CRDT + local-first) feature-complete | S128 D5 |
| **γ.5** | Plugin host v2 (WASM component model) feature-complete | S130 D5 |
| **γ.6** | AI substrate L0 feature-complete | S132 D5 |
| **γ.7** | Web shell feature-complete | S134 D5 |
| **γ.8** | Native shell (Tauri 2) feature-complete | S136 D5 |
| **γ.9** | Mobile shell (RN + Skia) feature-complete | S138 D5 |
| **γ.10** | Spatial shell (visionOS + WebXR) feature-complete | S140 D5 |
| **γ.11** | Marketplace v2 feature-complete | S140 D8 |
| **γ.12** | Multiplayer v2 (Figma-class) feature-complete | S142 D5 |
| **γ.13** | IFC4.3 import/export with cert feature-complete | S143 D5 |
| **γ.14** | All 9 BIM Phase 4–8 features feature-complete (CDE, COBie, federated clash, MEP, IFC4 cert, 4D-5D, analysis, LCA, cloud baked rendering) | S145 D5 |
| **γ.15** | First-party plugin set complete (12 plugins) | S145 D7 |
| **γ.exit** | Feature freeze; all SPECs satisfied; all benches green | S145 D9 |

### §8.3  Cadence inside γ

- **Bench-first**: every PR includes a bench. CI fails without one.
- **SPEC-first**: every feature traces to a SPEC ID. SPEC must be ratified before code.
- **Designer-embedded**: designer pairs with engineers daily for UI work. No "engineer interpreted the Figma".
- **Customer-validated**: every fortnight a 5-customer demo of newly-shipped features. Customer signal feeds backlog priority.
- **Weekly release**: PRYZM 4 alpha customers get weekly builds from γ.10 onward.

---

## §9  Stage δ — Migration + GA (S146 → S155, 10 sprints, 5 months)

**The cutover.** PRYZM 3 customers migrate to PRYZM 4; PRYZM 3 enters read-only sunset; PRYZM 4 becomes the canonical product.

### §9.1  Sub-phases

| Sub-phase | Deliverable | Lands by |
|---|---|---|
| **δ.1** | PRYZM 3 → PRYZM 4 migration tool (data, settings, plugins, custom families) | S146 D5 |
| **δ.2** | Dual-run mode — customers can switch back to PRYZM 3 for 90 days | S147 D1 |
| **δ.3** | Customer comms — email + in-app + founder-authored letter | S147 D3 |
| **δ.4** | Closed alpha (10 PRYZM 3 customers migrate to PRYZM 4) | S148 D5 |
| **δ.5** | Open alpha (50 customers) | S150 D5 |
| **δ.6** | Public beta (500 customers) | S152 D5 |
| **δ.7** | PRYZM 4 GA cutover — new signups land on PRYZM 4; existing customers prompted to migrate | S153 D5 |
| **δ.8** | PRYZM 3 read-only mode (12-month sunset window begins) | S153 D7 |
| **δ.9** | PRYZM 3 sunset complete — DNS removed, S3 archives sealed, billing terminated | S155 D5 |
| **δ.10** | Codebase consolidation — PRYZM 3 repository archived, PRYZM 4 becomes the single product | S155 D9 |
| **δ.exit** | PRYZM 4 day 1 acceptance checklist (§14 below) all green | S155 D10 |

---

## §10  Customer migration story (PRYZM 3 → PRYZM 4)

**Honest framing**: PRYZM 4 is a different product. Migration is not "click upgrade and continue working". Customers will lose:
- Their custom keyboard shortcuts (PRYZM 4 has Cmd-K instead)
- Their fixed-rail right-side inspector (PRYZM 4 has floating contextual inspector)
- Their familiar visual style (PRYZM 4 has new visual identity)

Customers will **gain**:
- Multi-shell (use the same project on iPad in the field, on Vision Pro for review, on desktop for production)
- Voice + AI-first workflows (Cmd-K verb resolution; ambient AI suggestions)
- Real-time multiplayer (Figma-class; live cursors, voice-in-app)
- Local-first (works fully offline; never blocks on network)
- Full BIM Phase 4–8 features (CDE, COBie, federated clash, MEP, etc.)
- Designer-led polish (every screen Figma-quality)
- WCAG 2.2 AAA accessibility
- Multi-region sovereignty + BYOK

### §10.1  Migration safety net

- **90-day dual-run** — customers can switch back to PRYZM 3 within 90 days, no data loss.
- **12-month read-only** — PRYZM 3 stays accessible read-only for 12 months after δ.7. Data export available throughout.
- **Migration tool** — data, settings, custom families auto-migrate. Plugins migrate if author publishes PRYZM 4 version.
- **White-glove for paying customers** — founder-led migration calls for top 50 paying customers.
- **Documentation** — full migration guide, video walkthroughs, voice-narrated AR walkthroughs.

### §10.2  Pricing transition

PRYZM 4 pricing is announced at δ.4 alpha. All PRYZM 3 paying customers get **lifetime PRYZM 4 access** at PRYZM 3 price as migration incentive. New PRYZM 4 customers pay PRYZM 4 prices.

---

## §11  Headcount, runway, cost

This is the honest cost of "best UI/UX + best architecture, designed-from-zero, no compromises".

### §11.1  Hiring plan

| Role | Hired by | Cost (USD/yr fully loaded) |
|---|---|---|
| Senior staff engineer (architect) | V.7 (S91) | $250K–$350K |
| Senior FE designer-engineer | V.7 (S91) | $200K–$280K |
| Senior product designer | V.7 (S91) | $180K–$240K |
| UX researcher | V.7 (S91) | $140K–$180K |
| Senior BE engineer | V.7 (S91) | $200K–$280K |
| Senior FE engineer #2 | γ.5 (~S130) | $180K–$240K |
| Senior BE engineer #2 | γ.10 (~S140) | $200K–$280K |
| **Total at peak (γ.10–γ.exit)** | — | **~$1.55M–$2.1M / year** |

Plus:
- **Founder** — full-time, full risk
- **Fractional CFO** — $5K/mo from S88 → S155 ≈ $80K
- **Fractional legal** — $4K/mo from S88 → S155 ≈ $65K
- **External SOC2 auditor** — $40K (Σ) + $50K (post-GA continuous)
- **External accessibility auditor** — $30K
- **External buildingSMART cert audit** — $50K
- **Drata or Vanta** — $25K/yr
- **Cloud infra (production + dev)** — $5K/mo ramping to $20K/mo by GA

### §11.2  Runway estimate (Stage Σ → δ exit)

| Stage | Months | Burn (avg) | Stage cost |
|---|---|---|---|
| Σ (validation) | 6 | $50K/mo | $300K |
| α + β (design + arch genesis) | 6 (overlapping) | $150K/mo | $900K |
| γ (build) | 14 | $200K/mo | $2.8M |
| δ (migration + GA) | 5 | $200K/mo | $1.0M |
| **Total Σ → δ** | **31 months** | — | **~$5.0M** |

**Plus revenue offsets**: PRYZM 3 paying customers (target 100 by Σ.exit, growing through γ → δ) provide partial offset. Realistic Year 1 (Σ.exit + 12 months) ARR target: $500K–$1M. Year 2 (γ midpoint + 12 months): $1.5M–$3M. Year 3 (PRYZM 4 GA): $5M+.

**Net capital needed**: **~$3.5M–$4.5M of external capital** assuming aggressive customer growth, **~$5M–$6M** assuming conservative growth.

### §11.3  Funding implications

This is **a Series A**. The thesis: "PRYZM 3 has 100 paying customers proving the architecture; PRYZM 4 is the from-zero next-gen multi-shell AI-first BIM product that captures the AEC vertical." Series A timing: between Σ.exit (S99) and α.1 (S100). Round size: $5M–$8M at $25M–$40M post.

Alternative: **bootstrap with revenue + small bridge ($500K)** — extends timeline; reduces team size to 4 instead of 7; pushes PRYZM 4 GA from S155 to ~S170 (+15 sprints, ~7 months).

---

## §12  Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Σ.8 fails** — can't get to 100 paying customers in 6 months | Medium | Stage gate fails; founder must extend Σ or pivot | Design partner program from S77 (already in M.* track); content marketing from S78; founder-led sales from S82 |
| **Hiring fails** — can't recruit 4 seniors in 3 months | High | Σ.7 misses; PRYZM 4 staffing cascades late | Start recruiting at S82 not S88; use specialized recruiters (Triplebyte for eng, Designer Fund for design); equity-heavy comp |
| **Funding fails** — Series A doesn't close | Medium-High | Bootstrap mode; PRYZM 4 timeline extends 6–12 months | Pre-Σ.exit investor conversations from S94; revenue-first focus; bridge round option ready |
| **PRYZM 3 customer churn during δ migration** | Medium | Revenue dip at GA; trust damaged | 90-day dual-run; lifetime PRYZM 4 access for PRYZM 3 customers; white-glove migration; founder-authored letter |
| **WebGPU adoption stalls** | Low (2027) | Renderer v2 needs WebGL2 fallback path (already planned) | Fallback path is mandatory in §5.2 |
| **Spatial computing market doesn't materialize** | Medium | Spatial shell has no users at GA | Spatial is opt-in; web shell remains canonical; spatial investment is bounded to γ.10 (one engineer-quarter) |
| **AI provider costs spiral** | Medium | Operating margin compressed | ADR-014 already mandates AI cost ceilings; multi-provider abstraction (Vercel AI SDK) lets us swap; user-BYOK option for power users |
| **Architectural lessons-learned override expectations** | Low-Medium | Some PRYZM 4 design decisions need revisiting | β allows ADR amendments through β.5; vertical slice (β.8) is the early-warning system |
| **Founder burnout** | Medium-High | Project stalls | Hire COO/CTO equivalent at Σ.exit; founder transitions to Product role; 4-week vacation mandatory at γ.exit |
| **Competitor (Speckle, Dalux, Snaptrude) ships first** | Medium | PRYZM 4 differentiation eroded | Differentiation is multi-shell + AI substrate + spatial — none of these competitors ship all three; double down on PDF-to-BIM + AI substrate as unique moats |
| **buildingSMART IFC4 cert fails** | Low (Σ.6 pre-audit catches this) | Enterprise sales blocked | Pre-audit at Σ.6; remediation in γ-BIM-features; cert audit at γ.13 |

---

## §13  What gets thrown away vs kept

### §13.1  Thrown away (PRYZM 3 → PRYZM 4)

- **Every line of TypeScript implementation code in `packages/`, `plugins/`, `apps/`** — rewritten from zero
- **Three.js renderer** — WebGPU-first replaces it
- **The white UI** (`src/ui/`) — archived as `apps/editor-classic/`, no longer canonical
- **`(window as any)` patterns** — already gone after PRYZM 3, stay gone
- **Vite build system** — Turbo + Rspack
- **Iframe plugin sandbox** — WASM component model
- **L7.5 AI placement** — AI moves to L0 substrate

### §13.2  Kept (PRYZM 3 → PRYZM 4)

- **Concepts**: composition root, plugin model, single rAF, CRDT event log, layered architecture
- **Customer data**: every project, every plugin, every setting auto-migrates
- **Customers**: PRYZM 3 paying customers get lifetime PRYZM 4 at PRYZM 3 price
- **Vision** (`08-VISION.md`) — 8 P / 8 L+L7.5 (refactored to L0–L8) / 10 D / NFTs all stay
- **Identity** (`06-PRYZM-IDENTITY-AND-RECOUNT.md`) — what PRYZM is stays the same product across the version transition
- **`.pryzm` file format** — extended for PRYZM 4 features but backward-compatible
- **44 PRYZM 2 ADRs** — referenced as historical decisions; PRYZM 4 ADRs (PR4-NNN) are new authoritative set
- **40 PRYZM 2 SPECs** — referenced; PRYZM 4 SPECs (PR4-SPEC-NNN) are new authoritative set
- **Lessons learned** (`PRYZM-3-LESSONS-LEARNED.md`) — drives every PRYZM 4 ADR

---

## §14  PRYZM 4 day 1 acceptance checklist

Every box ticked at δ.exit (S155 D10):

```
[ ] Web shell, native shell, mobile shell, spatial shell all green
[ ] All 12 first-party plugins published in marketplace
[ ] At least 5 third-party plugins published by external authors
[ ] WCAG 2.2 AAA verified by external auditor (Deque or Level Access)
[ ] SOC2 Type 2 attested
[ ] buildingSMART IFC4 certification awarded
[ ] All 9 BIM Phase 4–8 features feature-complete + benched + customer-validated
[ ] Multi-region deployment (US, EU, AU, UK, JP) live
[ ] BYOK live; sovereignty defaults enforced
[ ] Real-time multiplayer (Figma-class) live
[ ] Local-first (full offline) verified across all four shells
[ ] AI substrate L0 live; voice + Cmd-K + ambient suggestions all live
[ ] PRYZM 3 customers migrated (target ≥ 80 % of paying customers on PRYZM 4)
[ ] PRYZM 3 read-only mode live; sunset calendar published
[ ] Marketing site live in 5 languages
[ ] Pricing page live; billing flows work
[ ] In-app help, customer-facing changelog, status page, on-call rotation all live
[ ] PRYZM 4 GA bench suite green (≥ 200 benches)
[ ] PRYZM 4 GA gate green: pnpm pryzm-4-day-1 exits 0
```

---

## §15  The single command that proves PRYZM 4 exists

```bash
pnpm pryzm-4-day-1
```

Runs all 18 acceptance criteria above, plus:
- All four shells boot
- Vertical slice (one wall) lands → save → load → edit → render → sync in all four shells
- AI verb resolution works in all four shells
- WCAG audit passes
- Multi-region failover drill passes
- DR drill passes (RTO ≤ 30 s, RPO ≤ 5 s)
- Chaos drill passes (kill any one service → no data loss)
- All 200+ benches green
- All workflows green
- Customer-migration tool round-trips a real PRYZM 3 project to PRYZM 4 with zero data loss

If exit 0 → PRYZM 4 has been delivered.

---

## §16  TL;DR — the three-stage mental model

**You are signing up for a 31-month, ~$5M, 7-person mega-effort that delivers the best-in-class AEC web product in the market.**

The shape:
1. **Finish what you started** — wireup completes at S87 (M40), PRYZM 3 ships.
2. **Prove it works** — 6 months in production with paying customers (Σ, S88–S99).
3. **Build what comes next, from zero** — designer-led, multi-shell, AI-as-substrate, full BIM, sovereign-first PRYZM 4 (α + β + γ + δ, S100–S155, M77).

The honest tradeoff:
- **No shortcuts.** Every PRYZM 3 lesson absorbed; every PRYZM 4 line of code from zero.
- **Capital required.** ~$5M Series A or 6–12 month timeline extension if bootstrapping.
- **People required.** 7-person team at peak (you + architect + 2 designers + 4 engineers).
- **Time required.** 31 months from now to PRYZM 4 GA. ~M77 calendar.
- **Customers protected.** 90-day dual-run + 12-month PRYZM 3 read-only + lifetime PRYZM 4 access for PRYZM 3 customers.

What you will have on PRYZM 4 day 1:
- A web + native + mobile + spatial AEC product
- AI as the operating system (not a feature)
- Real-time multiplayer (Figma-class)
- WCAG 2.2 AAA
- Multi-region sovereign deployment with BYOK
- buildingSMART IFC4 certified
- All BIM Phase 4–8 features
- A marketplace with 12 first-party + ≥ 5 third-party plugins
- A bench suite that enforces every promise
- A codebase with no legacy, no dual identity, no compromises

This is **PRYZM 4**. The product the founder set out to build. The version that has no excuses.
