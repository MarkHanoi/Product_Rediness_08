# NSW — THE CITATION FINDING, AND WHAT FOLLOWS FOR THE §13 CI ASSERTION

> Lane **ENVELOPE-NSW** · 2026-09-04 · **A DECISION MEMO FOR THE FOUNDER, NOT A STATUS REPORT.**
> It asks one question and proposes one answer. Everything measured here is re-runnable from
> `phase0-transcripts/scripts/`; **re-run, do not re-transcribe.**
>
> Companion docs: `NSW-ENVELOPE-BUILD-PROMPT.md` (the brief), `phase0-transcripts/PHASE0-REPORT.md`
> (M1–M3), `NSW-INCLINED-PLANE-HANDOFF.md` (the cross-lane primitive question).

---

## 0 — The question, in one paragraph

The brief's non-negotiable **§1.2** reads: *"Every value carries its clause. The layers serve
`LEGIS_REF_CLAUSE` and `LEGIS_REF_VALUE`. A value in our output without them is a bug, not a style
choice."* Acceptance criterion **§13** turns that into CI: *"no value without a clause citation."*

**Measured, the premise is false for exactly the layers that matter, so the assertion as written is
unsatisfiable.** This memo states precisely how false, proposes the decomposition that makes it
enforceable, and names the one answer that must not be chosen.

---

## 1 — The measurement

Live against `mapprod3.environment.nsw.gov.au` ePlanning, excluding `NULL`, the empty string and
the service's literal `'Null'` sentinel.

### 1.1 — `LEGIS_REF_CLAUSE`, per layer

| Layer | Features | Clause populated |
|---|---:|---:|
| **Principal/14 Height of Buildings** | 40,964 | **94.8%** |
| **Principal/11 Floor Space Ratio** | — | serves a clause (`Clause 4.4`) on the sampled features |
| LP/572 Sun Access Protection | 154 | 29.9% |
| LP/485 Incentive Height of Buildings | 365 | 19.5% |
| LP/422 Alternative Building Heights | 79 | **0.0%** |
| LP/771 Alternative Height of Buildings | 91 | **0.0%** |
| LP/509 Macquarie Park Incentive HOB | 54 | **0.0%** |
| LP/429 Building Height Allowance | 203 | **0.0%** |
| LP/430 Building Height Plane | 9 | **0.0%** |
| LP/469 Floor Height Restriction | 14 | **0.0%** |
| LP/573 Sun Plane Protection | 9 | **0.0%** |
| LP/763 Overshadowing | 10 | **0.0%** |
| LP/420 Airport Buffer | 1 | **0.0%** |
| LP/512 Meteorological Station Height Limit | 7 | **0.0%** |

**The base control is well cited. The ten overlays that COMPETE with it are not cited at all.**
That is the worst possible distribution for this brief: precedence is the product (§0, §14), and
precedence is the one thing the citation field does not support.

`LEGIS_REF_VALUE` is worse and differently worse — 2.5% populated on Local Provisions, 0.0% on
SEPP, and where non-null it holds the LEP **map-symbol code** (`"N1"`, `"B"`), never a number.

### 1.2 — What IS served, at 100%, and was being given away

⭐ **`LAY_NAME` is populated on 996 / 996 vertical overlay features = 100.0%, on 19 distinct
strings state-wide** (`phase0-transcripts/layname-census.json`).

It carries the **quantity, the direction and the datum**:

```
"Maximum Building Height (m)" .................... a cap, metres above existing ground level
"Minimum Level Australian Height Datum (AHD)" .... a MINIMUM, absolute, on the FLOOR axis
"Minimum Floor Height Restriction Heights
 shown on map in AHD (m)" ........................ likewise — the service names its own datum
"Building Height Plane" .......................... an inclined plane; parameters elsewhere
"Protected Areas" / "Airport Buffer" / … ......... applicability only; the number is in the clause
```

**These are two different questions and they were being answered as one.** NSW does not serve the
CITATION for its overlays. It does serve the VALUE SEMANTICS for every one of them. The
fifty-metre units error of §6 is therefore **fully solvable from served attributes**, on a finite
closed vocabulary. Only **precedence** needs the clause.

> ⛔ **The cost of having conflated them, measured.** `PHASE0-REPORT.md` §M3.4 read parcel
> `152//DP877246`'s "HOB 8.5 m + layer-429 value 2.1" as an **additive height allowance**, and a
> guard was written around that reading. The service says otherwise on **203 of 203 rows**:
> `LAY_NAME = "Minimum Level Australian Height Datum (AHD)"`, in **BALLINA and BYRON** — coastal
> flood LGAs where 1.8–2.1 m AHD is a credible minimum habitable floor level and an absurd height
> bonus. It is a minimum, it is absolute, and it is on a different axis. `min(8.5, 2.1) = 2.1`
> stays catastrophic; **the guard written for it was guarding the wrong property**, and a guard
> aimed at the wrong property generalises wrongly the moment it meets a second parcel.

---

## 2 — Why §13 as written is unsatisfiable, and why that is not an argument for relaxing it

Read literally — *"no emitted value lacks a populated `LEGIS_REF_CLAUSE`"* — the assertion would
force PRYZM to refuse **~100% of NSW overlay controls**, permanently, because **no amount of
engineering populates a field the government does not fill.** A gate that can never go green is
not enforcement; it is a red light everyone learns to walk past.

⭐ **§UNSATISFIABLE-GATE-DECOMPOSITION-IS-THE-FIX (L-716) is the standing precedent, and it is
explicit that the remedy is decomposition, never relaxation.** The question to ask first is *"can
this ever be true?"* — and here the answer is no, so the assertion must be re-specified into
components that each can.

---

## 3 — The proposal: three arms where the brief had one

Implemented in `packages/site-parcel-data/src/rulepacks/au/nswCitationState.ts`.

### ARM A — LEGAL ADDRESS · hard-0 · **holds today at 100%**

Every emitted `RuleState` carries a `RuleSourceRef` with `country` / `authority` / `dataset`
populated — including every refusal, because a refusal with no citation is an unsourced claim
about the law (C58 §1.3). The layer identity is always known, so this never fails.

### ARM B — CITATION STATE · hard-0 · **the real invariant**

Citation becomes a **closed enum, never a nullable string**:

```
served            🟢 the feature itself carried LEGIS_REF_CLAUSE
registry-signed   🟢 a signed clause-registry row supplies one
registry-unsigned 🟠 a registry row supplies one and nobody has signed it — dev only
absent            🔴 no clause anywhere
```

> ⛔ **No control in state `absent` may contribute a number to the envelope.** Checked on caps
> *first*, before geometry and before datums, and on the base itself.

⭐ **This is survivable because the citation gap and the ROLE gap are the same gap.** An uncited
overlay has no registry ruling, so its legal role is `UNRESOLVED`, and the resolver never applies
an unresolved role. **Arm B does not ask the engine to do anything it does not already do — it
makes an emergent property checkable.** That is the whole difference between an invariant and a
coincidence, and it is why this arm can be hard-0 on day one.

`nullable string → closed enum` is not cosmetic. `clause: string | null` has exactly one way to
say "no clause" and no way to say **why**, and the four states have four different remedies.

### ARM C — UNCITED COUNT · shrink-only ratchet · **the number the founder actually wants at 0**

How many NSW controls PRYZM can see and cannot cite. It falls only when signed registry rows are
added. ⛔ Per **§RATCHET-EXCEEDED-IS-NEVER-DEBT (R7 / L-836)**, a breach is fixed by citing the
control — never by raising the ceiling, never by a `gate-debt.json` line.

---

## 4 — What PRYZM emits for a value whose clause is absent

**Three things, and never a clean number.**

1. **The control is reported**, with its layer, its instrument, its class and its value.
2. **It carries `citation.state = 'absent'` and a populated `absenceReason`** naming what is
   missing and what would close it — *"measured 0.0% populated on this layer family, so the
   absence is the service's, not this parcel's."*
3. **It is NOT APPLIED.**

### 4.1 — And the half that could have gone wrong silently

Refusing to apply an uncited **CAP** *overstates* the envelope. That is **L-616** — an UNKNOWN
constraint rendered as absent is an overstatement on real land, the standing precedent in this
repository. So refusing is only half a correct answer:

> `NswVerticalResolution.envelopeIsUpperBound` — `true` when an unapplied control could, **under
> some legal role still available to it**, produce a LOWER answer. The reported height is then the
> most the site **could** be, not the most it **may** be: **status C**, never status A.

The rule is deliberately narrower than "was anything left unapplied", because both obvious rules
are wrong. Flagging nothing hides real caps. Flagging everything marks parcel `5//DP240402` —
Alternative HOB **25 m** against a base of **12 m** — as underdetermined, when no available role
for that control yields less than 12. **A flag that cries wolf on the common case stops being read
on the rare one.** Not comparable (different datums, no number, unknown meaning) ⇒ *could lower*;
we must not pretend otherwise.

`publishable` implements §1.4 separately: `registry-unsigned` computes correctly and ships to
nobody, because status A is unreachable without a named signer.

---

## 5 — ⛔ The one forbidden answer

**Silently dropping the citation requirement.** §14 is explicit that this IS the differentiator:
*"Nothing in Archistar's public material claims per-parameter clause citation with typed refusal.
**Build that or do not enter.**"* An uncited value must be a typed, visible state. It is not
enough for it to be typed in a field a consumer may ignore, which is why `absent` blocks the value
rather than merely annotating it.

---

## 6 — What the founder is being asked to decide

1. **Ratify the three-arm decomposition** as the reading of §1.2 / §13, replacing the single
   literal assertion. *(Recommended. The literal assertion cannot go green, ever.)*
2. **Ratify `envelopeIsUpperBound` as a first-class, consumer-visible output** — an NSW envelope
   carrying an uncited cap is publishable as a **bound**, or not publishable at all. This is a
   product decision about what a customer sees, not an engineering one.
3. **Fund the clause registry, or accept Arm C's ceiling as permanent.** The overlay corpus is
   **small and hand-completable** — Building Height Plane is 9 polygons in one LGA, Sun Plane
   Protection 9 in one, Floor Height Restriction 14 in one, Airport Buffer 1, Met Station 7. The
   whole state's uncited vertical overlay tail is **996 features across 19 LAY_NAME strings**.
   This is days of legal reading, not a parsing programme. **It is the single highest-leverage
   spend in the NSW lane**, and nothing else moves Arm C.
4. **Authorise the data-broker approach** (`data.broker@environment.nsw.gov.au`, §3) — still not
   sent; founder-channel, outside a lane's authority. A supplied clause table would collapse Arm C
   directly.

---

## 7 — Sizing, so the decision is proportionate

From M3 (uniform random n=2,000; urban-weighted n=600):

- **>1 vertical control on 0.30% of NSW parcels** — but **68.3% of Sydney CBD parcels.**
  The precedence engine is a **CBD instrument**: rare state-wide, and firing exactly where a yield
  error is worth the most money.
- **39.2% of NSW parcels carry NO vertical control at all** — 130× more common than a precedence
  conflict. **The dominant path through this engine is the F1-vs-F2 decision**, not precedence.
- `m(RL)` is **~0.08%** state-wide — one parcel in 2,000 — and a fifty-metre error when wrong.
  A 1-in-1,200 case a type system eliminates for free is exactly the case a type system should
  eliminate: it will never be caught by eyeballing output.

---

## 8 — Status of the §13 acceptance criteria

| §13 criterion | State |
|---|---|
| Byte-identical output for the same parcel + vintage | ✅ asserted over all 6 fixture parcels |
| CI: no value without a clause citation | 🟠 **re-specified** — Arms A/B asserted, Arm C is the ratchet |
| Conditional Incentive HOB → base + unapplied uplift | ✅ `2//DP782292`, `5//DP240402` |
| `m(RL)` never treated as height-above-ground | ✅ `101//DP1265976`, corroborated by `MAX_B_H_RL` |
| `NA` refuses | ✅ and never rendered as unbounded (L-616) |
| Unresolvable Building Height Plane class → status C | ✅ reported, bounded, never extruded |
| A SEPP-covered parcel is never resolved LEP-alone | ⛔ **NOT BUILT** — SEPP layers are not wired |
| F1 and F2 remain separate | ✅ structurally — they cannot share a status |
| The 10.7 certificate CI check | ⛔ **NOT BUILT** — no council endpoint proven |

The two ⛔ rows are named rather than quietly omitted. Neither is blocked by a decision on this
memo; both are unstarted work.
