# C82 — Ribbon Capability Surface

> **Stamp**: 2026-08-14 · **Status**: CANONICAL
> **Scope**: the professional BIM ribbon — the 30 toolbar surfaces in
> `apps/editor/src/ui/toolbar/*.ts` and every toolbar surface added after them — and, by the same
> rule, any future gesture surface whose controls dispatch bus commands. Owns **the three legal
> states of a rendered control** (§1), **what "wired" means and who proves it** (§2), the
> **chat-reachability obligation on every wired verb** (§3), the **landing rule for new buttons**
> (§4), and the **conformance instrument** (§5). Does **not** own what a command is (**C03**), how
> a handler is authored (**C16**), the verb register (**C69**), chat routing itself
> (**C67**/**C68**), or the handler backlog the mount decision surfaced
> ([SPEC-50](../../03-execution/specs/SPEC-50-RIBBON-HANDLER-BACKLOG.md), which is a backlog and
> promises nothing).
> **Key principle**: *a control the user can click is a claim the product makes.* A button that
> dispatches into nothing is a lie with a hover state. Every control is therefore **WIRED**,
> **DISABLED-WITH-REASON**, or **ABSENT** — there is no fourth state, and the fourth state this
> contract abolishes was the measured majority.
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`, to
> [C70](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) (§0.1 BY-READ is never an award · §4.2
> machinery-present ≠ capability-reachable · §7.1 named-gap rule), and to
> [**ADR-0326**](../adrs/ADR-0326-mount-the-ribbon-disable-the-unbacked.md), which records the
> founder's 2026-08-14 decision (mount, do not delete, do not park) that this contract governs.
> Peers with **C69** (every verb id a control dispatches is register material the day it is
> handled — and a verb id is a persistence fact, C69 §1.1), **C67**/**C68** (what a wired verb
> owes the chat), **C06** (UI shell), **C16** (how the handler behind a wired verb is written).
> **Supersedes nothing.**
> **Gate**: the H6 gesture-reach probe (§5) EXISTS and is executable by hand; **no CI job runs it
> at stamp time** — that is a NAMED GAP, UNPROVEN per C70 §7.1, stated in §6 rather than implied
> green. The dispatch-side refusal machinery and its two-way pin are landed (`4bfe86f0`).
> **Changelog**: 2026-08-14 — created, on the founder's mount directive, after the H6 probe
> measured that the entire toolbar family was authored, spec-tested and unreachable.

---

## §0 — Why this contract exists: the measured state it forbids

Every count in this section comes from an executed artefact or a commit, cited inline. Where this
section and a re-run disagree, the re-run wins (C70 §0.2).

**The probe** (`b32d56ff`, `tools/rac-conformance/gesture-reach/results/gesturereach.json`,
first reading 2026-08-14): the 30 toolbar surfaces declare **280 gesture→command pairs** in their
`*_TOOLBAR_BUTTONS` arrays. Every real toolbar class was constructed against the **real**
`CommandBus` and every `[data-command]` button **clicked**. Result:

| Verdict | Count | Meaning |
|---|---|---|
| **EXECUTED-REACHED** | **0** | a registered handler on the real bus received the click's dispatch |
| **RESOLVED-ONLY** | **4** | the dispatch is proven, and the verb resolves only in the generated C69 register — `zoom-fit`, `zoom-selected`, `copy-selection`, `paste-clipboard` |
| **NOT-REACHED** | **267** | the click dispatched into **nothing** — no bus handler, no register row, no occurrence outside the surface and the command-bus type map |
| **UNPROVEN** | **9** | the verb occurred in files the probe could not classify — named, never counted as reached |

**All 30 surfaces had ZERO production importers.** The family was authored, type-mapped into
`CommandRegistry`, and covered by **30 green spec files asserting dispatch against a MOCK bus** —
and never mounted. Artefact counts said the capability existed; the probe said no user could reach
one pixel of it. That is C70 §4.2's defect at family scale (the L-847 shape), and it is why §2 of
this contract defines "wired" by the probe's verdict and by nothing else.

**The census** (`ae659c96`, `tools/rac-conformance/gesture-reach/results/verb-census.json`):
280 verbs → **4 BACKED · 0 REGISTER-ONLY · 276 UNBACKED**; per surface, **0 MOUNTABLE-WHOLE ·
1 MOUNTABLE-PARTIAL** (MainToolbar, 4 of 12) · **29 NO-BACKED-VERB**. The 267 NOT-REACHED pairs
are the **§C-B1 silent no-op class** — the same defect as the original dead `zoom-fit` /
`zoom-selected` buttons, at 267×.

**The refusal machinery** (`4bfe86f0`, landed deliberately *before* any mount): every unbacked
control now renders `disabled` + `aria-disabled` + `data-unbacked="1"` with a reason title, and
`refuseUnbacked()` guards the programmatic dispatch door (`triggerCommand()`) at all **41 dispatch
sites** across the 30 surfaces. Probe after: **NOT-REACHED 276, of which `declaredRefusal` 276;
UNPROVEN 0; EXECUTED-REACHED still 0**. Nothing became reachable; what changed is that **zero of
the 280 pairs is a silent no-op**. `declaredRefusal` is a strict subset of NOT-REACHED, never a
deduction from it — "refused" can never be misread as "fixed".

---

## §1 — The three legal states

> **§1.1 — MUST. A ribbon surface renders a control ONLY in one of three states:**
>
> | State | Definition | Obligation |
> |---|---|---|
> | **WIRED** | dispatches to a registered handler on the real bus, proven **EXECUTED-REACHED** by the H6 probe (§2) | enabled; C67/C68-bound (§3) |
> | **DISABLED-WITH-REASON** | the capability does not exist; the control is `disabled` + `aria-disabled`, does **not** dispatch through either door (mouse or `triggerCommand()`), and its reason **names what is missing** (§1.3) | counted in the census as UNBACKED; a SPEC-50 row exists for it |
> | **ABSENT** | not rendered | none — absence is always legal |

> **§1.2 — MUST NOT. A control that dispatches into nothing is prohibited.** This is the §C-B1
> silent no-op class, measured at **267 of 280** pairs at census time (`ae659c96`) and at **0**
> after `4bfe86f0`. The prohibition covers **both doors**: `disabled` stops the mouse; it does not
> stop `triggerCommand()`, the programmatic entry every surface exposes — both refuse or the lie
> just moves. A regression that re-opens either door on any pair is a defect of this contract, not
> a style issue.

> **§1.3 — MUST. The reason names the missing capability, not merely the refusal.** A refusal
> that does not say WHAT was refused is barely better than silence. The floor (landed) is a title
> naming the verb; the target this contract binds is a reason that cites the missing capability
> **by contract or spec reference** — for the current 276, that is the verb's row in
> [SPEC-50](../../03-execution/specs/SPEC-50-RIBBON-HANDLER-BACKLOG.md). *Exit condition:* every
> DISABLED-WITH-REASON control's reason resolves to a SPEC-50 row or a contract section.

> **§1.4 — MUST NOT. DISABLED-WITH-REASON is not a parking state.** A control may hold it only
> while its capability is genuinely missing; the moment the verb reads EXECUTED-REACHED the
> control MUST be enabled (the two-way pin in §5.3 makes holding it disabled a test failure, not a
> choice). The converse of §1.2: needlessly disabling a working button is the same defect facing
> the other way.

---

## §2 — What WIRED means, and who proves it

> **§2.1 — MUST. The H6 gesture-reach probe's EXECUTED-REACHED verdict is the definition of
> "wired".** EXECUTED-REACHED requires a registered handler on the **real** bus receiving the
> **click's** dispatch — execution and resolution are never merged (C70 §0.1). Nothing else
> qualifies:
>
> - **RESOLVED-ONLY is not WIRED.** A register row proves the verb exists somewhere; it does not
>   prove this surface reaches it.
> - **Artefact counts prove nothing** (C70 §4.2). The measured history is the argument: **30
>   surfaces, 30 green spec files asserting dispatch against a mock bus, zero production
>   importers** (`b32d56ff`). Files, type-map entries, and spec files were all present and all
>   green while 0 of 280 pairs was reachable.
> - **BY-READ is never an award** (C70 §0.1). A reviewer reading the handler source and the
>   toolbar source and concluding they connect has concluded nothing this contract accepts.

> **§2.2 — MUST. The BACKED set is generated, and pinned both ways.** The hand-written
> `BACKED_TOOLBAR_VERBS` in `apps/editor/src/ui/toolbar/commandBacking.ts` MUST equal the
> census's BACKED set exactly — a missing verb needlessly disables a working button (§1.4); an
> extra one re-opens §C-B1 on a visible button (§1.2). `commandBacking.spec.ts` pins this in both
> directions (`4bfe86f0`).

> **§2.3 — MUST. A verb changes state only by a probe re-run.** Wiring a handler, registering it
> in the composed runtime, and re-running H6 to EXECUTED-REACHED is the only path from
> DISABLED-WITH-REASON to WIRED. Updating `BACKED_TOOLBAR_VERBS` without the census following, or
> the census without a probe run behind it, is transcription — the C69 §0.1 defect applied to
> reachability.

---

## §3 — Every WIRED verb is C67/C68-bound

> **§3.1 — MUST.** A verb that reaches EXECUTED-REACHED is a registered bus command, so
> **C68 §4 applies to the PR that wires it**: the C69 register regenerated in the same PR
> (C69 §3.3), and a declaration in exactly one of C68 §5.b's three disjoint places — a
> `ChatCapability` (chat-reachable), a **`CHAT_UNAVAILABLE`** entry (a refusal a user could
> read), or a `ChatCommandClassification` entry with a falsifiable reason. Undeclared is not an
> option; the C68 ratchet is 0.

> **§3.2 — MUST NOT.** Mounting a surface is not a C67/C68 event; wiring a verb is. `4bfe86f0`
> is the precedent read: `check-chat-capability-coverage` green before and after, UNDECLARED
> 0/0, because **nothing became newly reachable**. A PR that flips a verb to WIRED without its
> §3.1 obligations is incomplete regardless of what the ribbon looks like.

---

## §4 — The landing rule for new buttons

> **§4.1 — MUST. A new toolbar button lands ONLY in a legal state:** either **with its handler**
> (WIRED — probe re-run in the same PR, §2.3, and C67/C68 discharged, §3.1), or
> **DISABLED-WITH-REASON naming the missing capability by contract/spec reference** (§1.3) —
> which for a genuinely new capability means its SPEC-50 row (or successor backlog row) is added
> in the same PR. Landing a new enabled button that dispatches into nothing re-creates §0 one
> button at a time and is prohibited by §1.2.

> **§4.2 — MUST. The census floors hold.** The probe carries subject floors (≥ 25 surfaces
> driven, ≥ 250 pairs at stamp; reading 30 / 280). A surface added to the ribbon joins the
> probe's subject set in the same PR — a surface the probe cannot see is a surface this contract
> cannot govern, which is the §0 state readmitted.

---

## §5 — The conformance instrument

> **§5.1 — the probe.** `tools/rac-conformance/gesture-reach/__tests__/gesturereach.probe.ts`,
> its own vitest root beside the certification harness, reusing the certification world (real
> `CommandBus`, real `initBusHandlers`, happy-dom). Run:
> `npx vitest run --root tools/rac-conformance/gesture-reach --config vitest.config.ts __tests__/gesturereach.probe.ts`.
> Results: `results/gesturereach.json`. Five permanent controls watched both ways on every run
> (C70 §5.6), including a planted nonexistent command reading NOT-REACHED by name and an inert
> button reading NOT-REACHED by absence of dispatch.

> **§5.2 — the census.** `tools/rac-conformance/gesture-reach/build-census.ts` →
> `results/verb-census.json` — the machine-readable verb → {register-row?, handler?, reached?}
> table for all 280 pairs, and the artefact every count in this contract, in ADR-0326 and in
> SPEC-50 cites. Its own `notMeasured` block is part of the reading, not a footnote.

> **§5.3 — the dispatch-side arm.** `applyCommandBacking()` / `refuseUnbacked()` in
> `apps/editor/src/ui/toolbar/commandBacking.ts`, pinned two-way by `commandBacking.spec.ts`
> (§2.2). 41 dispatch sites guarded across 30 surfaces (`4bfe86f0`).

> **§5.4 — what the instrument does NOT measure, carried from its own output so this contract
> is never read as coverage:** keyboard shortcuts (the CREATE rail activates TOOLS, not
> commands), the command palette, context menus, the ~120 panel `executeCommand` sites, the
> legacy `src/ui` toolbar, handler-write **correctness** (`check-verb-liveness` owns it), and
> mount as **rendered DOM** (the probe's mount evidence is static import evidence). Each of
> those surfaces earns this contract's protection only when an instrument of the same class
> reaches it.

---

## §6 — Gates and their honest status

Per C70 §7.1, a gate named here that does not run at HEAD is a **NAMED GAP**, UNPROVEN — never an
inherited green.

| Arm | Status at stamp | Asserts |
|---|---|---|
| H6 probe + census (§5.1–§5.2) | **EXISTS, hand-run** — no CI job executes it (and `64edbc8e` records the contract-gate suite itself running zero gates in CI at the time, so "add it to the suite" is not yet a discharge) | §1.2 (zero silent no-ops), §2.1 (EXECUTED-REACHED set) |
| `commandBacking.spec.ts` two-way pin (§5.3) | **LANDED, green** (`4bfe86f0`: toolbar specs 31 files / 704 tests) | §2.2 both directions |
| Reason-names-capability (§1.3 target form) | **NAMED GAP, UNPROVEN** — the landed reason names the verb; no check asserts it cites a SPEC-50 row | §1.3 |
| CI execution of the probe with §4.2 floors | **NAMED GAP, UNPROVEN** | §4.1, §4.2 |

**Exit conditions**: (1) a CI job runs the probe with its floors and fails on any silent no-op —
exit 2 below floors, never 0; (2) every DISABLED-WITH-REASON reason resolves per §1.3; (3) the
BACKED set moves only with a probe run behind it (§2.3), which the two-way pin already enforces
mechanically.

---

## §7 — Anti-patterns

- **§7.a — The enabled button wired to nothing.** §1.2. The contract's reason for existing,
  measured at 267/280.
- **§7.b — Proving a surface by its artefacts.** §2.1 / C70 §4.2. Thirty green spec files against
  a mock proved the mock.
- **§7.c — RESOLVED-ONLY worn as WIRED.** §2.1. A register row is not a reachable gesture.
- **§7.d — Guarding the mouse and leaving `triggerCommand()` open.** §1.2. Both doors or neither.
- **§7.e — A reason that says "unavailable" and nothing else.** §1.3. Refusal without a name is
  barely better than silence.
- **§7.f — Parking a working verb in DISABLED-WITH-REASON.** §1.4. The two-way pin makes this a
  red test; do not make it a habit first.
- **§7.g — Editing `BACKED_TOOLBAR_VERBS` by hand to make a button work.** §2.3. The probe moves
  the set; hands do not.
- **§7.h — Wiring a verb and skipping its C67/C68 declarations.** §3.1. The ribbon and the chat
  are the same capability surface wearing two inputs.
- **§7.i — Landing a new surface outside the probe's subject set.** §4.2. Ungoverned is not a
  state; it is the old state.
