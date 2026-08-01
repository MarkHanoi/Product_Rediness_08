# RISK-REGISTER — Murcia (INE 30030)

> Fail-safe honesty guardrails. **Last updated:** 2026-08-01. **Maintainer:** UNASSIGNED.

| # | Risk | Guard (the honest default) |
|---|---|---|
| R1 | Borrowing another city's legal numbers | LEGISLATION + ENVELOPE stay `not-assessed`; no pack invents a value (§CONTEXT-DATA-HONESTY). |
| R2 | Reading `not-assessed` as 0 % | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset + flagged `partial`. |
| R3 | Claiming measured heights before a bake | HEIGHTS `not-assessed` until a provenance probe; no measured source baked. |
| R4 | Claiming TERRAIN is verified | rung capped at **50** (baked-but-unverified) — no `terrain.verify.mjs` round-trip recorded. |
| R5 | Quoting a coverage **bound** as if it were a value | ⬆ **CLOSED 2026-08-01.** The cross-tab is run and re-runnable (`tools/murcia-coverage-crosstab/`); `RATE.md` §CLOSURE quotes **23.51 %**, a measured point value with its artefact and its method. |
| R6 | A measured number going stale as the pack changes | `packages/site-parcel-data/__tests__/murciaCoverageCrosstab.test.ts` fails if the pack allow-list, the remitted-prefix list or the committed `out-crosstab.json` moves. A 15th transcribed calificación breaks the build until the measurement is re-run. |

## ✅ R-7 — the disposition's delegation test was NARROWER than the PGOU's, by 13.09 pp — **CLOSED 2026-08-01**

**Status: CLOSED** by §R-7-DELEGATION-PARITY. `murciaEnvelopeDisposition` now applies **all four**
delegation grounds, each citing its own article:

| ground | article | now applied? |
|---|---|---|
| *ordenación remitida* (`TA TM UA UH UM`) | Arts. 6.6.2 / 5.24.5.1 | ✅ (always was) |
| *clase de suelo* = **Urbanizable** → Plan Parcial | Art. 6.2.2.3 | ✅ **NEW** (`isUrbanizableClase`) |
| ámbito `UE` / `UD` | Arts. 5.25.1 / 5.25.2 | ✅ **NEW** (`DELEGATING_AMBITO_PREFIXES`) |
| ámbito `P*` (Planes Especiales / Parciales) | Art. 5.26.2 | ✅ **NEW** (`isPlanEspecialPrefix`) |

The new block sits **above** the PGOU-direct block, so a packed calificación on delegated soil now
returns a `derived-plan` refusal (`legallyGrounded: true`) instead of an `envelope`.

**The gate that keeps it closed:** `murciaCoverageCrosstab.test.ts` no longer asserts the asymmetry —
it asserts **parity**: the union of `REMITTED_AMBITO_PREFIXES` + `DELEGATING_AMBITO_PREFIXES` must
equal the crosstab's reviewed legal set exactly, and `isPlanEspecialPrefix` / `isUrbanizableClase`
must agree behaviourally with `classify.mjs`. Adding a ground to the legal list without adding it to
the shipping code re-opens R-7 and fails the build.

⚠ **`out-crosstab.json` `shippingBehaviour` is now STALE by design.** Its
`wouldRenderOnSignature_pct = 36.59` describes the **pre-fix** code. Re-run the tool against the live
layers to regenerate it; the expected post-fix value is `intersection.packedAndDirect` = **23.51 %**.

### What R-7's closure unlocked

R-7 was the **safety precondition** for rendering, and with it closed the render path was built in
the same pass (§MURCIA-ENVELOPE-RENDER). **Murcia now publishes envelopes** on PGOU-direct packed
land — the 23.51 % SIG-MU1 authorises — and refuses, cited, everywhere else.

## 🔴 R-8 — the signature bypassed the disposition entirely (**was LIVE; fixed 2026-08-01**)

**Status: the defect is FIXED; the underlying capability gap is OPEN.**

When SIG-MU1 flipped `MURCIA_ENVELOPE_VERIFIED` to `true`, the L5 dispatcher's guard read
`if (!MURCIA_ENVELOPE_VERIFIED && resolution.ok)`. The flip therefore made the **entire disposition
block unreachable**, and every Murcia parcel fell through to the generic `no-rule-pack` coverage
refusal. The signature made the city **strictly worse**: it published no envelope (the dispatcher
never could), and it **discarded the cited, `legallyGrounded: true` `derived-plan` refusal** that the
67 % delegated land had before — replacing it with an untrue statement about our own coverage
("PRYZM holds no transcribed rule") in a city holding a signed 14-zone pack.

⚠ **The lesson, and it generalises to every gated jurisdiction.** The interlock designed to prevent
exactly this lived *inside* the disposition (the `reason` field on the `envelope` branch), while the
guard that skipped the disposition lived *outside* it. **An interlock downstream of the branch that
bypasses it is not an interlock.** The gate must govern what we may **publish**, never whether we may
**read the law**. `murciaSiteDispatch.test.ts` was already RED on `main` and correctly caught this.

**Remaining gap: CLOSED in the same pass.** §MURCIA-ENVELOPE-RENDER now maps the disposition's
`kind: 'envelope'` to `computeBuildableEnvelope` with `ES_MURCIA_PGOU2012_PACK`, keyed on the
disposition's `matchedCode` (so the `RF1`→`RF` / `IXT`→`IX` variants resolve to the zone whose
article is cited, instead of finding nothing and silently answering whole-parcel).

**Murcia renders.** Measured end-to-end on the founder's own 30 × 31 m fixture: calificación `RL` on
`Urbano` → inset **315.0 m²**, height **7 m**, 2 plantas, tier `estimated-ruleset`, every derived
constraint carrying Art. 5.14.3 with its verbatim quote.

⚠ **Why re-testing delegation in the dispatcher is FORBIDDEN.** Everything that makes rendering safe
is established *above* that branch, by the disposition, in the plan's own precedence. A second test
at the render site would be a second, driftable statement of the safety property — the
L-422/457/467/469 failure family. The disposition is the ONE decision point; the branch only draws
what it decided.

⚠ **The tier is part of the authorisation, not a detail.** `ZoningRulesEngine` assigns
`estimated-ruleset`, which is exactly what SIG-MU1 authorises («`authoritative` is UNREACHABLE — a
constructed determination is capped at 0.70 on ENVELOPE»). A pinned test fails if it is promoted.

---

<details><summary>R-7 as originally recorded (kept for the audit trail)</summary>

**Status: OPEN. A named pre-signature blocker.** Not live today (two gates are shut), and recorded
here rather than hidden precisely because it becomes live the moment they open.

`murciaEnvelopeDisposition` (`packages/site-parcel-data/src/providers/murciaZoningProvider.ts`)
decides delegation on **one** test: is the sector prefix in `REMITTED_AMBITO_PREFIXES`
(`TA TM UA UH UM`)? The PGOU delegates on **three more grounds**, and the pack's own dossier already
cites all of them:

| ground the disposition does NOT apply | article | packed land it would wrongly publish on |
|---|---|---:|
| *clase de suelo* = **Urbanizable** → Plan Parcial | Art. 6.2.2.3 | **10.64 pp** (7.993 M m²) |
| ámbito `UE` (Unidad de Actuación) | Art. 5.25.1 | part of the **2.45 pp** below |
| ámbito `UD` (Estudio de Detalle) | Art. 5.25.2 | ″ |
| ámbito `P*` (Planes Especiales / Parciales) | Art. 5.26.2 | ″ |
| | | **13.09 pp total (9.834 M m²)** |

⇒ with `MURCIA_ENVELOPE_VERIFIED = true` **and** L5 taught the `envelope` branch, PRYZM would render
on **36.59 %** of buildable land — **above the 33.00 % the PGOU orders directly**. That is a
general-plan number published on land the general plan expressly declines to order: the *«proxy
PGOU»* error this dossier exists to prevent, latent in our own dispatch.

**Guard today:** `MURCIA_ENVELOPE_VERIFIED = false`, *and* the L5 dispatcher does not consume
`kind: 'envelope'` (the `reason`-carrying safety interlock). Both must hold. **Nothing may open
either gate until the disposition applies the full delegation test.** `murciaCoverageCrosstab.test.ts`
pins the gap's size so it cannot shrink or grow unnoticed.

⚠ *Both halves of that "guard today" turned out to be wrong within the day: the first gate WAS
opened (SIG-MU1) without the delegation test being widened, and the second "interlock" could not fire
because the dispatcher's own guard skipped the disposition that carried it (§R-8).*

</details>

*Authority: C63 §3.1 (honesty companion), C62 (typed unknowns), L-656, L-616.*
