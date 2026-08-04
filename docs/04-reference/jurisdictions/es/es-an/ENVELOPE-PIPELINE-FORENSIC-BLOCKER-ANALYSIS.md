# Envelope Pipeline — Forensic Blocker Analysis (all jurisdictions)

> **Status:** SNAPSHOT, taken 2026-08-03 at `HEAD=fb7b6f71`. Not a living document — re-run this audit
> before trusting it against a later HEAD. Stored under `es-an/` at the requester's direction; scope
> is **repo-wide**, not Andalucía-only (Andalucía's own jurisdictions — Córdoba, Málaga, the
> regional-generic gap — are one section within it).
>
> **Method:** every claim below traces to a `git show HEAD:<path>` read (not a disk read — the
> working tree carries ~6,640 tracked-but-deleted files unrelated to envelope code, so disk reads
> were treated as unreliable) or a `git log`/commit-hash citation. No claim in this document is
> unsourced.
>
> **Companion to:**
> | For | Read |
> |---|---|
> | The status-only capability matrix this document forensically re-derives and corrects | [ENVELOPE-CAPABILITY-MATRIX.md](../../../ENVELOPE-CAPABILITY-MATRIX.md) |
> | Córdoba's own dossier | [14021-cordoba/](../14021-cordoba/) |
> | Málaga's own dossier | [29067-malaga/](../29067-malaga/) |

## Why this document exists

A capability-matrix status label ("BLOCKED", "signed", "5% capability") answers *what state a
jurisdiction is in*. It does not answer *what specific line of code, external party, or decision is
the actual thing stopping a user from getting an envelope today*. Two independent audits this
session found the matrix's own rows drifting from code the same day a gate flipped (Córdoba,
Zaragoza) — this document exists to re-derive ground truth directly from `siteDispatch.ts`,
`registry.ts`, and each jurisdiction's rulepack file, jurisdiction by jurisdiction, and to state the
one smallest irreversible action that moves each one forward.

---

## Summary table

| Jurisdiction | Verification | Dispatch | Rendering | Root blocker | Eng. effort | Smallest unlock |
|---|---|---|---|---|---|---|
| Barcelona (registered claus) | Complete (SIG-4) | Succeeds — `applyBcnZoningThenFallback` (`siteDispatch.ts:4552`) | Computes | None | — | — |
| Barcelona — heritage/flood overlays | N/A, ungated | Dead code — zero call sites anywhere | Missing entirely | Engineering | Days | Wire heritage overlay call site first (harder geometry constraint) |
| Barcelona — clau 22a | Founder decision "on hold" | N/A | Refusal only | Product | Unknown | Founder re-decides Option A |
| Catalunya regional | N/A (nothing keyed) | Reaches cited refusal via registered-jurisdiction guard | Refusal, correct | Legal (structural) | N/A | None — per-municipality authoring is the path |
| Madrid NZ-1 | Complete (SIG-M2, `c0004a50`) | Succeeds — `siteDispatch.ts:2280` gate passes | Computes, footprint-only | External authority (CPPHAN case law undiscoverable) | Unknown | External data request, or founder confirms footprint-only is permanent |
| Madrid NZ-3 | N/A, permanent refusal | Succeeds, refuses immediately (`:2155`) | Refusal, correct | Legal | N/A | None needed |
| Madrid NZ-4/5/7/8/9 | Unsigned, but not binding | Refuses at gate (`:2167`) | No compute path exists even if signed | Engineering (signing alone ships nothing) | 1-2 days compute + 1-2 wk street-width | Write compute branch before requesting signature |
| Madrid CM_SPACM | Unsigned, not binding | **Unreachable by click** — zero references anywhere | Missing entirely | Engineering (bbox routing bug) | 3-5 days | Polygon `contains` predicate from `Callejero:SIGI_V_MUNICIPIOS` |
| Murcia (packed ~23.5%) | Complete (SIG-MU1) | Succeeds — `:3804` | Computes | None (packed share) | — | — |
| Murcia — RL 7m cesión | (same gate) | Succeeds, but over-grants | Computes, incorrectly | Engineering | Small-medium | Buffer `pgou_ejes` 7m, intersect RL boundary |
| Murcia — delegated 67% | N/A | Refuses correctly | Refusal, correct | Legal (structural) | N/A | None available |
| **Córdoba** | **Complete** (`6d2357a8`) | Reaches gate, gate passes, **but the `else` branch (`:3260-3282`) never calls compute** | **Refusal only, despite signed gate** | **Engineering only** | **1-2 hours** | **Replace `:3260-3282` with a real compute call** |
| **Málaga** | N/A, no rulepack exists | No dispatcher exists — falls to `applyEstimatedZoning` | **Fabricated estimate rendered** | Municipality issue / external authority (Oracle account locked at source) | Unknown, then 2-4 days | Contact Ayuntamiento de Málaga / GIS vendor |
| **Andalucía regional** | N/A, no pack exists | No code | **Fabricated estimate rendered** | Product decision | Unknown, unscoped | Founder decides build-vs-per-municipality |
| València | Not signable by construction | **No dedicated `isInValencia` branch, but IS caught by the generic §L-663 registered-jurisdiction guard inside `applyEstimatedZoning`** | **Cited refusal renders correctly (`valenciaNoRulePackRefusal`) — CORRECTED 2026-08-03, see below** | Legal (Plano C) only | Legal: unknown | None for dispatch — only the Plano C legal/data question remains |
| Balears | Unsigned | Succeeds, gate shut, refuses | Refusal only, no fabrication | Founder + Product (6 overlay families unmodelled) | Founder: hrs-days | Sign VERIFICATION.md; separately decide open-top-indicative shipping |
| Canarias/Telde | Unsigned | No dispatcher, falls to refusal via registry match | Refusal only | Product decision (46/88 munis unroutable — confirmed unautomatable) | Unknown | Founder ruling on multi-instrument routing |
| Aragón — Zaragoza | Unsigned, **not the binding blocker** | **No dispatch function exists at all** | Missing entirely, would stay missing even if signed | Engineering | Hours (proven pattern) | Write `applyZaragozaZoningThenFallback` before requesting signature |
| Aragón — Huesca | N/A, nothing to sign yet | No dispatcher, refuses via registry match | Refusal, correct | Missing authoritative data (georeferencing rejected at 2.31m vs 3× bar) | Unknown, open research | Filter georef candidates by bound stroke class |
| Galicia (4 munis scaffolded) | N/A, zero code | No code, unregistered | **Fabricated estimate rendered** (guard doesn't even trigger) | Research incomplete | Weeks/muni | Legislation-sourcing pass for A Coruña |
| Castilla y León | N/A, zero code | No code | **Fabricated estimate rendered** | Research incomplete / not started | Unknown | First discovery pass — nothing smaller is definable yet |

**Bold** = Andalucía-scope jurisdictions (this folder's namesake) plus the two highest-priority
cross-region findings.

---

## The fabricated-estimate correctness bug (cross-cutting, not jurisdiction-specific)

> ⚠ **CORRECTION, 2026-08-03, same day.** This section originally listed València alongside the
> other four as sharing the fabricated-estimate bug. That was **wrong**, found by tracing the actual
> execution path rather than grepping for a per-city branch name: `applyZoning`'s fallthrough calls
> `applyEstimatedZoning`, whose FIRST action is `refuseEstimateInsideRegisteredJurisdiction` (the
> §L-663 guard) — this calls `resolveRegisteredJurisdictionAt`, which reads the full `REGISTRATIONS`
> array in `registry.ts` (confirmed: València's entry is there, fully formed, `extent: VALENCIA_BBOX,
> contains: isInValencia`, `isInValencia` a real bbox check, not stubbed). A València parcel is
> therefore caught and refused via `valenciaNoRulePackRefusal` **before** the fabricated-estimate
> dispatch line is ever reached. **No dispatch fix is needed for València — it already refuses
> correctly.** The other four (Málaga, Andalucía-regional, Galicia, Castilla y León) are genuinely
> unregistered, so the guard has nothing to match and the bug is real for them.
>
> This means "add an `isInValencia` branch" — recommended repeatedly across this session's prior
> outputs and one external dossier — is unnecessary. It would not change behavior; the registered-
> jurisdiction guard already produces the exact outcome that branch would have produced.

**Málaga, Andalucía-regional, Galicia, and Castilla y León all share one live bug** (València
removed from this list — see correction above): an
unregistered or under-wired jurisdiction does not fail safe. `applyEstimatedZoning`
(`siteDispatch.ts:1387`) serves a generic setback/FAR/coverage estimate with no visual or data
distinction from a real, legally-grounded envelope. Canarias, Huesca, Zaragoza, and Balears do **not**
have this problem — each is registered, so the L-663 guard (`refuseEstimateInsideRegisteredJurisdiction`,
`siteDispatch.ts:5478`) intercepts the fallback and serves a cited refusal instead.

This means the cheapest, highest-leverage action available across five different jurisdictions is
the same one: **register the jurisdiction with a bare `noRulePackRefusal`, even with zero rulepack
content**. For València this is ~30-60 minutes (the refusal function already exists, just needs a
dispatch branch). For Andalucía-regional, Galicia, and Castilla y León, this is a new-but-tiny
registry entry per jurisdiction — cheaper than authoring any real coverage, and it stops presenting
fabricated numbers as real answers today.

---

## Andalucía-specific detail

### Córdoba — signed, one engineering task from shipping

- **Verification (`esCordobaZoneClassification.ts:48`):** `CORDOBA_ENVELOPE_VERIFIED = true`, signed
  by commit `6d2357a8` ("founder-delegated execution"), 2026-08-03 14:22:37, citing 13/13
  OCR-verified subzones and two independently re-audited closed items (CTP-1/MC guard `6dbad1f2`,
  UAD-3 `ef0e966b`).
- **Dispatch:** `applyCordobaZoningThenFallback` (`siteDispatch.ts:~3132`) is reached from
  `applyZoning` and checks `CORDOBA_ENVELOPE_VERIFIED` at line **3229**. The check passes (gate is
  `true`), but the `else` branch (lines **3260-3282**) unconditionally calls `cordobaNoRulePackRefusal`
  — `computeBuildableEnvelope` is never invoked anywhere in the file for Córdoba. The sign commit's
  own message states this compute branch was "deliberately NOT written" — discovered during a
  post-sign smoke check, not before signing.
- **Rendering:** Refusal only, despite the open gate. The branch's in-code comment still blames a
  "confidence-plumbing" defect — that comment is **stale**: `capEnvelopeConfidenceToPackDefault`
  (L-665) already landed and was confirmed present in `ZoningRulesEngine.ts` before the signature was
  applied.
- **Root blocker:** Engineering, purely. No legal, data, or authority gap remains on the signed
  5-subzone scope.
- **Smallest unlock:** Replace `siteDispatch.ts:3260-3282` with a real `computeBuildableEnvelope`
  call keyed on the already-resolved subzone (`resolveCordobaSubzone` runs upstream at ~line 3172),
  mirroring Murcia's proven pattern at `siteDispatch.ts:3804-3811`. **Estimated 1-2 hours.** Unlocks
  ~31% of the pilot's buildable land immediately — the highest-ROI single action found in this
  entire audit.
- **Known defect, separate from the above:** `apps/editor/__tests__/cordobaSiteDispatch.test.ts:193`
  still asserts `CORDOBA_ENVELOPE_VERIFIED === false`. It is currently false-failing against the
  `true` value set by `6d2357a8` — that sign commit updated 6 other test files touching the same
  constant but missed this one.

### Málaga — parameters exist, routing does not, and the reason is external

- **Verification:** N/A — no `MALAGA_*_VERIFIED`/`_CERTIFIED` constant, no rulepack file, no
  `MALAGA_JURISDICTION_ID` anywhere in the repo. Only research artefacts exist:
  `tools/andalucia-envelope-max/*.mjs` and `docs/04-reference/jurisdictions/es/es-an/29067-malaga/`.
- **Dispatch:** No branch exists. A Málaga parcel falls through every `if` in `applyZoning` and
  terminates at the unconditional `applyEstimatedZoning` fallback (`siteDispatch.ts:1387`).
- **Rendering:** **Fabricated generic estimate rendered** — not even a refusal. Worse outcome than
  every other Andalucía-adjacent jurisdiction in this document.
- **Root blocker:** Municipality issue / external authority. Málaga's own GIS layer
  (`muralPGOU:POLCALIF_T`) returns `ORA-28000: la cuenta está bloqueada` (Oracle account locked at
  the source), confirmed with a control test — 3/3 unrelated layers on the same service responded
  normally, 0/8 `muralPGOU` layers did. This is entirely upstream of PRYZM; no amount of engineering
  time resolves it.
- **Smallest unlock:** Someone contacts the Ayuntamiento de Málaga or its GIS vendor to unlock the
  datastore. Effort: **unknown**, not schedulable by engineering. Once unblocked: ~2-4 days to author
  a pack (some parameter data already read from prior probes, cited in the matrix row and
  `29067-malaga/` docs) plus a Málaga-specific subzone resolver — Córdoba's resolver was independently
  confirmed **not to port**, different field names and filename convention.

### Andalucía regional (generic, region-wide) — the "can this generalize" question

- **Verification:** N/A — no regional rulepack file exists. The only occurrences of `es-an` in the
  codebase are documentation-path prefixes, a folder-naming convention, not a rulepack.
- **Dispatch:** No code exists.
- **Rendering:** Fabricated generic estimate, for every Andalusian parcel outside Córdoba's 2-district
  pilot.
- **Root blocker:** Product decision. In-repo evidence from the two cities actually investigated
  points *against* easy generalization on its face: Córdoba has working routing/dispatch machinery
  but subzone parameters that are municipality-specific (OCR'd PGOU-2001 text); Málaga has
  well-sourced parameter data but zero routing and a structurally different GIS stack (Oracle-backed
  `muralPGOU`, distinct field/filename conventions from Córdoba's source). They fail at *opposite*
  ends of the same pipeline — which is itself informative, not just an absence of information.
- **A dedicated deep investigation into exactly this question — whether Córdoba's OCR/verification/
  geometry/rulepack/dispatch/rendering stages can be factored into a reusable Andalucía-generic
  platform across all 8 provincial capitals (Córdoba, Málaga, Sevilla, Granada, Jaén, Almería, Cádiz,
  Huelva), with per-component reuse-percentage estimates and a concrete architecture RFC — was
  commissioned the same session this document was written. Its findings should be appended here (or
  linked) once complete; as of this snapshot it had not yet landed.**
- **Smallest unlock:** Founder decides between (a) a Catalunya-style regional refusal-floor
  registration now — cheap, stops the fabricated-estimate exposure across the whole region
  immediately, mirrors `esCatalunya.ts`'s pattern (`registry.ts:1412-1454`) — or (b) waiting for the
  generalization RFC above before committing to any regional architecture.

---

## Capability-matrix rows confirmed stale against this audit

1. **Córdoba** — row states "awaiting founder sign-off only... entire remaining path." Already
   signed (`6d2357a8`); the real blocker is the unwritten compute branch above. Confirmed
   independently by two separate audits this session.
2. **Zaragoza** — row explicitly claims *"no engineering left... mirrors Córdoba's position exactly."*
   False: no dispatch function for Zaragoza exists at all (`isInZaragoza` absent from
   `applyZoning`'s if-chain); signing today would render nothing new.
3. **Balears** — mislabeled `UPPER_BOUND`. Per the matrix's own definition (UPPER_BOUND = draws
   something), Balears draws *nothing* today — the open-top-indicative jurisdiction list is
   empty of a Balears entry despite the label implying otherwise. Should read `BLOCKED`.
4. **CM_SPACM** — has no row at all, despite its own gate, dossier, and a self-documented
   "reachable by import, unreachable by click" admission in-file.
5. **València** — row names only the legal blocker; silent on the separately-verifiable fact that no
   dispatch branch exists, meaning even a favorable legal answer wouldn't render anything without a
   second, independent engineering fix.
6. **Huesca** — the "superseded 1980 plan" claim has no backing artifact anywhere in the repo;
   should be treated as unsourced pending citation. The "gis.huesca.es unreachable" half of the same
   cell *is* backed (`tools/aragon-plan-georef/out/net_reachability.json`).
7. Upstream doc `docs/04-reference/jurisdictions/es/es-ar/ARAGON-BUILDABILITY-RESEARCH.md`
   self-contradicts in its own header ("CLOSED, answer is no" vs. "NOT closed as impossible" one
   paragraph later) and is superseded by the current routed-and-registered state of both Aragón
   cities.

All other capability-matrix rows (Murcia, Madrid NZ-1, Madrid NZ-3-9, Barcelona, Canarias, Málaga,
Andalucía-rest/Galicia) were independently confirmed **consistent** with code at this snapshot.

---

## Prioritized roadmap (impact vs. effort, repo-wide)

| # | Action | Effort | Why |
|---|---|---|---|
| 1 | Write Córdoba's compute branch (`siteDispatch.ts:3260-3282`) | 1-2 hours | Already signed; unlocks ~31% of pilot land immediately |
| ~~2~~ | ~~Add `isInValencia` dispatch branch~~ | — | **RETRACTED 2026-08-03** — the §L-663 guard already catches València correctly; verified by execution trace, not needed |
| 3 | Fix the stale rows above (Zaragoza, Córdoba, Balears especially) | Minutes | Prevents a founder signing Zaragoza expecting it to render |
| 4 | Land Murcia's RL 7m cesión fix | Small-medium | Closes a live 16.53% over-grant on an already-shipping jurisdiction |
| 5 | Wire Barcelona's heritage + flood overlays | Days | Built and tested; pure wiring on the highest-capability jurisdiction |
| 6 | Zaragoza dispatch build (parallel with, not blocked by, the signature) | Hours | Same proven pattern as Córdoba; without it a signature ships nothing |
| 7 | Founder decision batch (Balears/Canarias/Zaragoza signatures, Canarias multi-instrument ruling, Andalucía-regional build-or-don't) | Hours-days, founder time only | Zero engineering cost, unlocks the next tier combined with #6/#8 |
| 8 | CM_SPACM polygon routing | 3-5 days | Unlocks dispatch reachability for 178 municipalities (still gated after) |
| 9 | Madrid NZ-4/5/7/8/9 compute branch + street-width primitive | 1-2 days + 1-2 weeks | Largest single land-area unlock in Madrid; largest single engineering lift |
| 10 | External-authority chases (Málaga Oracle unlock, València municipal answer, Huesca alternate-network retest) | Unknown, not PRYZM's clock | Not schedulable; someone should own initiating contact |
