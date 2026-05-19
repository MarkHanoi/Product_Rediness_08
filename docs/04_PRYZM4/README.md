# `docs/04_PRYZM4/` — the from-zero next-generation product

> **Status (2026-04-29)**: planning corpus only. Stage Ω (PRYZM 3 wireup, sprints S72→S87) is in mid-Phase C-D and must reach PRYZM 3 day 1 first. PRYZM 4 implementation does not start until Stage Σ (PRYZM 3 production validation, S88→S99) clears its 12-criterion gate. Earliest line of PRYZM 4 code: ~S100 (M48). PRYZM 4 GA target: ~S155 (M77).

---

## What this folder is

Everything that defines, plans, and (later) builds **PRYZM 4** — the designed-from-zero, multi-shell (web + native + mobile + spatial), AI-as-substrate, sovereignty-first BIM product that succeeds PRYZM 3.

PRYZM 4 is **not** an evolution of PRYZM 3. It is a from-zero rebuild informed by:

1. The lessons learned during PRYZM 3 production validation (Stage Σ, 6 months of paying customers).
2. The 12 PRYZM 4 design pillars (designer-led · multimodal-native · spatial-first · multiplayer-native · local-first · AI-as-substrate · WCAG 2.2 AAA · sustainable · open · sovereign · plugin-equals-product · bench-first).
3. The 10 PRYZM 4 architecture pillars (Rust+WASM kernel · WebGPU renderer · OPFS-first storage · WASM-component plugin sandbox · Solid/Svelte UI · Turbo+Rspack build · TS+Effect types · RN+Skia mobile · Tauri 2 native · visionOS+WebXR spatial).

---

## What lives in this folder today

| File | Purpose |
|---|---|
| [`PRYZM-4-NEXT-GEN-PLAN.md`](./PRYZM-4-NEXT-GEN-PLAN.md) | The master plan — three-stage arc (Σ + α + β + γ + δ), 12 design pillars, 10 architecture pillars, sub-phases, headcount + runway (~$5M, 7-person team peak), risk register, customer migration story, day-1 acceptance checklist, and the single command (`pnpm pryzm-4-day-1`) that proves PRYZM 4 exists. ~700 lines, 16 sections. |

---

## What will live here over time

The folder will fill in waves, one per stage:

| Stage | Sprints | Months | What it adds to this folder |
|---|---|---|---|
| **Σ — Production validation** | S88 → S99 | 6 | `Σ-PROD-VALIDATION-PLAN.md` (the 12-criterion gate, mirrored chunk-by-chunk); `Σ-LESSONS-LEARNED.md` (live during stage); `Σ-EXIT-CERTIFICATE.md` (signed at S99) |
| **α — Design genesis** | S100 → S111 | 6 | `α-DESIGN-RESEARCH/` (ethnography, customer interviews, competitive scan); `α-DESIGN-SYSTEM-V2/` (locked Storybook, multimodal patterns, spatial UI patterns); `α-EXIT-CERTIFICATE.md` |
| **β — Architecture genesis** | S106 → S117 | 6 (overlap) | `β-ADRS/` (PR4-001 through PR4-024: 12 pillar ADRs + 12 tech ADRs); `β-SPECS/` (PR4-NNN, ~20 specs); `β-REFERENCE-ARCHITECTURE.md`; `β-VERTICAL-SLICE/` (4-shell proof); `β-EXIT-CERTIFICATE.md` |
| **γ — Build** | S118 → S145 | 14 | `γ-TRACKS/` (Foundation, Plugins, Shells, AI, BIM-features); `γ-RELEASE-LOG.md` (weekly customer alpha builds); `γ-BENCH-CATALOG.md` (≥ 200 benches at γ.exit) |
| **δ — Migration + GA** | S146 → S155 | 5 | `δ-MIGRATION-TOOL/` (PRYZM 3 → PRYZM 4); `δ-DUAL-RUN-PLAYBOOK.md` (90 days); `δ-GA-CHECKLIST.md`; `δ-CUSTOMER-COMMS/` (alpha → beta → GA → sunset); `δ-EXIT-CERTIFICATE.md` (PRYZM 4 day 1) |

---

## What does **not** live here

- **PRYZM 1 / PRYZM 2 historical material** → `docs/01_PRYZM1/` (and the now-archived `02_PRYZM2` label).
- **PRYZM 3 architecture, ADRs, SPECs, wireup chunks, runbooks, audits** → `docs/03_PRYZM3/03_PRYZM3/`.
- **The `PRYZM-3-CONVERGENCE-PLAN.md`** that defines PRYZM 3 day 1 and which gates the start of Stage Σ → `docs/03_PRYZM3/03_PRYZM3/PRYZM-3-CONVERGENCE-PLAN.md`.
- **The wireup plan (`PRYZM2-WIREUP-PLAN-S72`)** whose folder name preserves its historical "PRYZM 2" label per the chunk slice contract → `docs/03_PRYZM3/03_PRYZM3/reference/phases/audits/PRYZM2-WIREUP-PLAN-S72/`.

---

## Reading order on day 1

1. The "what comes after PRYZM 3" section (§11) of [`../03_PRYZM3/03_PRYZM3/PRYZM-3-CONVERGENCE-PLAN.md`](../03_PRYZM3/03_PRYZM3/PRYZM-3-CONVERGENCE-PLAN.md) — **why** PRYZM 4 exists and how it is bridged from PRYZM 3.
2. [`PRYZM-4-NEXT-GEN-PLAN.md`](./PRYZM-4-NEXT-GEN-PLAN.md) — the full plan. Read §1 (three-stage arc), §4 (design pillars), §5 (architecture pillars) on first pass; treat §6–§9 (the per-stage sub-phase tables) as reference; come back to §11 (cost), §12 (risks), §14 (acceptance checklist) at each stage gate.

---

## What is locked vs. what is provisional

- **Locked (ratified by founder, 2026-04-29)**: the existence of PRYZM 4 as the named successor; the three-stage arc shape (Σ → α/β → γ/δ); the requirement that no PRYZM 4 code is written before Σ.exit; the 12 design pillars and 10 architecture pillars as the **direction** (specific technologies subject to β-stage ratification).
- **Provisional (subject to revision at Σ.exit and β.exit)**: specific sprint numbers and month estimates; specific technology picks (Rust kernel, WebGPU, Solid/Svelte, Tauri 2, etc.); specific cost figures; specific headcount ramp; specific customer migration mechanics.

The plan is **honest scaffolding**, not commitment to specific implementation choices made before the validation evidence exists. Stage Σ exists precisely so that the architecture choices made in β are informed by 6 months of real customer signal, not by hopes.
