# User Guide — AI Apartment Layout Generator

> **What it does, in one line:** draw the outer shell of an apartment, click one
> button, and PRYZM's AI proposes several complete interior layouts (internal
> walls + doors) — ranked and scored — that you can preview and build with a
> single click, fully undoable.

- **Audience:** architects, designers, and anyone laying out residential floor plans in PRYZM.
- **Feature status:** GA (shipped). Capstone of the Semantic Design Assistant (prompt "#51").
- **Where to find it:** the **AI panel** → command tree → **Create** → **"Generate apartment layout (AI)"**.
- **Contract / spec:** governed by `docs/02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md` §3.4 and `docs/archive/pryzm3-internal/reference/specs/SPEC-APARTMENT-LAYOUT-GENERATOR.md`.

---

## 1. What you get

Given an apartment **shell** that already exists in your model — the outer
(perimeter) walls, plus the entrance door and any windows — the generator:

1. Reads the shell's geometry (net area, dimensions) and classifies each outer
   wall by daylight and orientation (which side faces the entrance, which has the
   most windows, which is "blind").
2. Asks the AI to propose **N interior layouts** (default 3) that satisfy a set
   of hard space-planning rules.
3. **Validates** every proposal and throws away ones that break the rules
   (re-asking the AI up to 3 times to fix them).
4. **Scores** the survivors on four axes and ranks them.
5. Shows you the ranked options in a modal — each as a 2D plan thumbnail with its
   score and room list.
6. When you pick one, it **builds the internal walls and doors** in your model as
   a single undoable action, then re-detects the rooms automatically.

It does **not** touch your model until you explicitly pick an option. Generating
is always safe and read-only.

---

## 2. Before you start — prepare a shell

The generator needs an enclosed outer shell on the **active level**. For best
results:

- ✅ **Draw the perimeter walls** so they form a closed loop (a rectangle is the
  simplest; L-shapes and simple concave shells work too). You need **at least 3
  exterior walls**.
- ✅ **Set the active level.** The layout is generated for whichever level is
  currently active.
- 👍 **Add an entrance door** on one of the perimeter walls. The generator treats
  that wall as the "entrance side" and keeps the entrance hall near it. (If there
  is no entrance door, it just uses the first perimeter wall as the entrance side.)
- 👍 **Add windows** on the perimeter walls where you have them. The generator
  puts living rooms and bedrooms on the walls with the most daylight. Walls with
  no windows are treated as "blind" and used for bathrooms, storage, corridors.

You do **not** need to draw any internal walls — that's exactly what the
generator produces.

> **Tip:** the more accurately your shell reflects the real apartment (windows in
> the right places, entrance on the right wall), the better the AI's daylight and
> circulation decisions will be.

---

## 3. Generate layouts (step by step)

1. Open the **AI panel**.
2. In the command tree, go to **Create**.
3. Click **"Generate apartment layout (AI)"**.
4. You'll see a toast: *"Generating apartment layouts…"*. The AI is working
   (typically a few seconds).
5. When it's done, the **options modal** appears with the ranked layouts.

If something's not ready, you'll get a clear toast instead — see
[Troubleshooting](#7-troubleshooting).

---

## 4. Reading the options modal

Each option is shown as a **card**:

| Card element | What it tells you |
|---|---|
| **Plan thumbnail** | A small top-down sketch of the proposed walls (lines) and doors (dots). North is up. |
| **Title** | A one-line summary of the layout's idea (e.g. *"Central corridor — bedrooms north, living south"*). |
| **Score `NN/100`** | The overall quality score (higher is better). Cards are sorted best-first. |
| **Score bars** | The four sub-scores (see below), each 0–100%. |
| **Room list** | Every room with its type and floor area (m²). |
| **Meta line** | Counts: number of rooms, doors, and total area. |
| **"Use this layout"** | Builds this option in your model. |

At the bottom: **Cancel** (or press **Esc**, or click outside the modal) discards
all options and changes nothing.

### The four score axes

| Axis | What it rewards |
|---|---|
| **Light** | More of the floor area in rooms that have a window. |
| **Privacy** | Bedrooms further (in door-to-door steps) from the entrance hall. |
| **Kitchen** | Kitchen next to the dining area **and** on an outside (window) wall. |
| **Circulation** | Less of the floor area spent on corridors (more usable space). |

The overall score is a weighted blend of the four (equal weights by default).

---

## 5. Build a layout

Click **"Use this layout"** on the card you like. PRYZM then:

1. Creates all the **internal walls** of that option.
2. Creates the **doors**, each hosted in its wall (the opening is cut and the door
   leaf placed).
3. Wraps the whole thing in **one undo step** — so a single **Undo** (Ctrl/Cmd-Z)
   removes the entire generated layout, not piece by piece.
4. **Re-detects rooms** automatically, so your new rooms appear in the model with
   their boundaries.

You'll get a confirmation toast: *"Built layout — N walls, M doors."*

> The outer shell walls, entrance door, and windows you started with are **left
> untouched** — only the interior is added.

### Undo / redo

- **Undo** once to remove the whole generated layout.
- **Redo** to put it back.

### Don't like any of them?

Click **Cancel** (or **Esc**). Nothing is built. Run **"Generate apartment
layout (AI)"** again to get a fresh set of options — each run is independent.

---

## 6. What the AI is told to respect (validation rules)

Every proposed layout must pass these hard rules, or it is rejected (and the AI
is asked to fix it). This is why the options you see are always *buildable and
sensible*, never nonsense:

| # | Rule |
|---|---|
| Minimum areas | master ≥ 12 m², bedroom ≥ 9, living ≥ 18, kitchen ≥ 8, bathroom/en-suite ≥ 4 |
| Natural light | every master / bedroom / living / kitchen has at least one window |
| Direct access | no room is reachable only by passing through another (an en-suite via its master is allowed) |
| Corridor width | the narrowest corridor meets the minimum (default 900 mm) |
| Door clearance | every door is at least 600 mm wide |
| Adjacency | en-suite is next to its master; kitchen is next to dining (when open-plan) |
| Program | the room counts match what was requested (bedrooms, bathrooms, en-suite, living room) |

### Pre-furnishing validators (the geometry sanity check)

After the AI (or the offline engine) proposes a layout, PRYZM runs **two parallel layers of validators** before any candidate is scored. These catch the "looks plausible but is geometrically or topologically broken" failure modes — so by the time you see a card, every room already passes:

**Dimensional layer — is each room a sensible SHAPE?**

| Validator | What it catches | Severity |
|---|---|---|
| Room-area maximums (G1) | A bedroom ballooning to 30 m² because the engine over-allocated. | HARD |
| Room-width maximums (G2) | A 1.8 m × 6 m "bedroom-as-corridor" — too narrow to be a real bedroom. | HARD |
| Aspect-ratio (G3) | A 1:5 corridor-shaped living room. | HARD |
| Furniture-fit (G5) | A 2.1 × 2.1 m "kitchen" the actual kitchen run won't fit into. | HARD |
| Apartment envelope (D2.4) | A 765 m² shell forced into a 1-bed program (or the inverse — a 30 m² shell with 4 beds). HARD-rejects up-front so the engine doesn't try and fall back to a worse layout. | HARD |
| Kitchen-triangle (G10 / NKBA) | Cooker→sink→fridge legs sum > 8.0 m or < 3.6 m — unworkable. | HARD/SOFT bands |
| Frontage (T2.5) | A living / kitchen / master / bedroom buried fully interior with no window wall. | HARD (required), SOFT (preferred) |

**Topology layer — do the rooms RELATE sensibly?**

| Validator | What it catches | Severity |
|---|---|---|
| Mandatory adjacencies (T2.1) | A master with no en-suite door (when en-suite is in the program); a hall without a corridor door. | HARD |
| Forbidden adjacencies (T2.2) | A bedroom door directly into another bedroom (privacy violation). | HARD |
| Wet-cluster (T2.4) | Kitchens / bathrooms / utility scattered across the plate instead of stacked over one plumbing run. Soft — lowers Pareto rank but doesn't drop. | SOFT |
| Acoustic zoning (T2.3) | A bedroom wall shared with a living-room speaker side. | SOFT |
| Circulation sequence (T2.6) | An entrance hall LARGER than the living room it releases into (the "anti-climax" reading). | SOFT |
| Corridor connectivity (T1.C) | A bedroom whose only door is into the living room — no direct circulation access. Soft so it never drops, but lowers the topology score. | SOFT |

If a candidate fails ANY HARD validator it never enters the Pareto pool. SOFT validators lower the layout's topology / shape quality, which feeds the overall score so cleaner layouts rank higher.

### The default "program"

Today the generator uses a sensible default brief:

- **2 bedrooms**, **1 bathroom**
- open-plan **kitchen + dining**
- a **living room**
- an **entrance hall**

(A configurable program form — choose bedroom/bathroom counts, en-suite, etc. —
is planned; see [Limitations](#8-limitations--whats-next).)

### Default construction settings

- Internal wall thickness: **100 mm**, height follows the level's floor-to-ceiling.
- Doors: **900 mm** wide, **2.1 m** high, single-leaf.
- Minimum corridor width: **900 mm**.

---

## 7. Troubleshooting

| Message / symptom | Cause | Fix |
|---|---|---|
| *"No active level — create or open a level first."* | No level is active. | Create/open a level and make it active, then retry. |
| *"Need at least 3 exterior walls on the active level."* | The shell isn't closed / has too few perimeter walls. | Draw the perimeter walls so they enclose the apartment (≥ 3 outer walls). |
| Modal shows **"No valid layouts were generated."** | The AI couldn't produce a layout that passes the rules for your shell (e.g. the shell is too small for the default program). | Try a larger shell, or wait for the configurable-program form to request fewer rooms. |
| *"Layout generation failed"* toast | The AI service was unreachable, rate-limited, or over quota **and** the offline engine also couldn't place a layout (e.g. a degenerate shell). | Check the shell is a closed, sensible polygon and retry. With a valid shell the offline D-TGL engine should always deliver (see §10). Nothing was changed. |
| Summaries say **"(offline · D-TGL)"** | The AI was unavailable, so the built-in deterministic engine generated the layouts. | Expected — these are real layouts. Configure an AI upstream (server `ANTHROPIC_API_KEY` / `CF_WORKER_URL`) to use the AI path instead. |
| *"Failed to build the layout."* | An error occurred while creating the walls/doors. | Undo (to be safe), then retry. If it persists, report it. |
| Thumbnails look empty | The option had no internal walls (rare). | Pick a different option or regenerate. |

Nothing the generator does in Phase A (generating/previewing) changes your model,
so it's always safe to cancel and try again.

---

## 8. Limitations & what's next

**Today:**

- Uses a **fixed default program** (2 bed / 1 bath / open-plan KD / living /
  hall). A program form (choose counts, en-suite, etc.) is the next step.
- Generates **walls and doors** only — **no furniture** yet (furniture placement
  is a separate, planned Semantic Design Assistant phase).
- One level at a time (the active level).
- Quality depends on the AI model; complex or unusual shells may yield fewer
  valid options.

**Planned:**

- Configurable program (bedroom/bathroom counts, en-suite, open vs. closed
  kitchen) before generating.
- Furniture + fixtures placement on the chosen layout.
- Per-room finishes and lighting (already available as separate batch commands).

---

## 9. Privacy & cost

- **Where your data goes:** generating sends an abstract description of your shell
  (dimensions, wall/window/door positions and counts — **not** your full project)
  to the AI, routed through PRYZM's server (never directly to a third party from
  your browser). Auth, rate-limiting, and quota are enforced server-side.
- **Cost:** each generation is a small metered AI call (estimated well under
  $0.18) and counts against your plan's AI budget (free / personal / team). The
  modal preview and building a chosen layout cost nothing extra.

---

## 10. How it works under the hood (for power users)

```
AI panel: "Generate apartment layout (AI)"
  → gather shell from the active level (exterior walls + windows + entrance)
  → AiPlane workflow 'apartment-layout-generate'  (runs in your browser, L7.5)
       1. analyse shell (area, dimensions, daylight/orientation per wall)
       2. prompt the AI relay  → JSON layout options
       3. validate each (hard rules) → retry ≤3 feeding failures back
       4. score + rank → keep the best N
       5. save to the AI store + open the modal     ← read-only, nothing built
  → you pick an option
  → 'apartment.layout-execute'
       6. pre-mint wall/door/opening ids
       7. one batch: create walls → cut door openings → create doors  (command bus)
       8. ONE undo entry; rooms auto-redetect
```

- **Read-only generate, explicit execute** (ADR-014): the model is never mutated
  until you pick an option.
- **All building goes through the command bus** (principle P6), as one
  `BatchCoordinator.runBatch` → a single undo unit.
- **Doors are hosted elements** (contract C15): each door's opening is reserved on
  its wall and linked to the door so undo removes both together.
- **Runs in-process** on the AiPlane (C09 §2.4), loaded lazily so the AI code adds
  nothing to PRYZM's startup time.

### Offline mode — the deterministic engine (no AI key needed)

If the server has no AI connection configured (or it's temporarily unavailable),
PRYZM doesn't give up — it generates the layouts with a built-in **deterministic
design engine (D-TGL)** that runs entirely in your browser, no tokens, in under
two seconds. You get the same ranked, scored cards in the same modal; the only
difference is the summary reads **"(offline · D-TGL)"**.

What it does, in order:

1. **Decompose the shell** into rectangles (handles L / T / U shapes, not just boxes).
2. **Bubble diagram** — turn your program into the rooms to place + the adjacencies
   an architect would draw (entry → living ↔ kitchen/dining; bedrooms + baths off a
   corridor; master ↔ en-suite), with each room sized to fill the shell.
3. **Subdivide** — pack the rooms into the shell as sensible near-square footprints
   (a squarified treemap), public space near the entrance.
4. **Walls + doors** — extract shared/exterior walls (no duplicates) and place doors
   on the required adjacencies; open-plan links get no wall.
5. **Semantic model** — build a typed graph of spaces, walls, openings and doors
   (the BIM3.0 "digital twin" payload, IFC-ready), each with a stable id.
6. **Score with Space Syntax** — rank candidates on five axes (efficiency,
   adjacency, daylight, circulation, regularity); "circulation" rewards the classic
   public-shallow / private-deep gradient.
7. **Emit geometry** — the winning layouts become the same walls + hosted doors the
   AI path produces, built through the same one-undo batch.

It tries **eight different layout strategies** and shows you the best ones. Because
it's deterministic, the *same shell + program always produces the same layouts* —
useful for comparing changes. Full detail: `SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md`.

---

## 11. FAQ

**Does it overwrite my existing walls?** No. It only adds internal walls and
doors. Your shell, entrance, and windows are untouched.

**Can I edit the result?** Yes — once built, the walls and doors are ordinary
PRYZM elements. Move, delete, or retype them like anything else.

**Why did I get fewer than 3 options?** Some proposals failed validation for your
shell and were dropped. You get every valid option, up to the requested count.

**Can I run it again?** Yes. Each run replaces the previous pending options. Pick
from the newest set.

**Is the result deterministic?** It depends which engine ran. With a live AI
connection, results vary between runs (the validation and scoring are deterministic,
so whatever you see is always rule-compliant and ranked consistently). In **offline
mode** (the built-in D-TGL engine, summaries marked "offline · D-TGL"), it is fully
deterministic — the same shell + program always yields the same layouts.

**Do I need an AI key / internet for this to work?** No. If the AI is unavailable
the deterministic offline engine takes over automatically and still produces real,
architecturally-sound layouts (see §10, "Offline mode").

---

*See also:* `SPEC-APARTMENT-LAYOUT-GENERATOR.md` (full specification),
`SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md` (the offline deterministic engine),
`C09 §2.4 / §3.4` (AI contract), `C15` (hosted doors), `C16`/`C17` (command &
catalogue contracts).
