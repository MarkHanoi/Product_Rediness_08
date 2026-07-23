# Barcelona / Catalonia — Real-Envelope RISK REGISTER

**Purpose.** The Barcelona pipeline presents a REAL, cited buildable envelope on real Catastro
parcels. Some of what it shows is a **constructed determination** (an algorithm run on real inputs),
not an official municipal number. This register tracks the risks of that — above all the L-518
decision to badge the founder-signed PGM Art. 242.2 determination as **real, not ESTIMATED** — so the
call is on the record with its mitigations. Founder-owned; review before any change to what the panel
badges as authoritative.

**Standing principle (from the whole build):** *the only acceptable failure is a refusal — an absent
envelope costs nothing; a wrong profunditat edificable on Passeig de Gràcia costs credibility.* Every
risk below is scored against that: does the mitigation FAIL SAFE (refuse / badge honestly) or fail
loud-and-wrong?

## R1 — Badging a CONSTRUCTED determination as "real" (the L-518 decision) · **HIGH · ACCEPTED**
**Risk.** The profunditat edificable (e.g. 27.3 m) is **not a looked-up official figure**. It is
*constructed* per PGM Art. 242.2 — an algorithm (largest depth in [11, 30] m that leaves ≥30% of the
block as interior free space) run on a **real dissolved Catastro manzana**. Badging it "real / PUB"
(dropping the ESTIMATED badge, L-518) risks implying a municipal authority the number does not have.
**Why accepted.** The founder signed the SOURCE acceptance on 2026-07-20 (the **L-449 gate**): the
Art. 242.2 rule + the AMB/MMAMB Normativa Urbanística Metropolitana (Dec 2010, consolidated
31-12-2009) IS the governing determination for a 13a Eixample block. The construction has real inputs
(real block geometry) + an accepted rule; that is materially different from the generic estimated
default. **Mitigation (must all remain true for the "real" badge to be honest):**
1. The new confidence tier means exactly *"real inputs + accepted rule + CONSTRUCTED geometry"* —
   NOT *"official published municipal determination."* It must be worded so in the panel, not as a
   bare green "verified".
2. Every per-field citation stays visible (PGM Art. 242.2 / Art. 322.1, the L-449 acceptance line).
3. The existing caveat **"a 2008 modification to Art. 327 §2 is NOT reflected"** stays on the card —
   do not drop it when the badge goes green.
4. It is only applied to the **block-derived** path (`depthBinding !== null`, source `catastro-muc`),
   never to the generic estimated-default pack.
**Residual.** A user could still read "real" as "the city stamped this." The wording mitigation (1)
is the control; if wording is lost in a refactor, this risk re-opens.

## R2 — Wrong frontage / block → a wrong depth badged real · **HIGH · MITIGATED**
**Risk.** The depth is measured from the street frontage. If the parcel/block frontage is
mis-classified (the L-515 defect: the −Z placeholder marked a side edge as front), the depth band
lands on the wrong axis — and with R1 it would now be badged REAL. **Mitigation.** L-515 fix:
parcel frontage from **block-perimeter membership** (road-independent, geometrically grounded); the
solver **refuses** (returns null → no envelope) when no frontage or a degenerate block
(`solveBlockDerivedDepth` guards, §BLOCK-DEPTH-REQUIRES-FRONTAGE L-465); the block dissolve refuses a
non-conforming tiling. Fails safe (no envelope) rather than loud-and-wrong. **Residual.** Corner
parcels have 2 frontages but the clip currently uses only the FIRST (`findIndex`) — logged; a corner
plot could inset from one of its two streets. Verify corner cases before calling R2 closed.

## R3 — Wrong clau (zone) → wrong rule · **MED · MITIGATED**
**Risk.** MUC GetFeatureInfo could return the wrong/adjacent qualification → the wrong rule pack.
**Mitigation.** §MUC-ONE-CONTAINER-OR-REFUSE (one containing qualification or refuse); non-Eixample
claus (13b, 22@, …) fall back to ESTIMATED rather than borrow Eixample's depth. Fails safe.

## R4 — Estimated placeholder read AS real (the inverse of R1) · **HIGH · OPEN (L-521)**
**Risk.** In the draw-boundary flow the panel currently stays on the ESTIMATED placeholder
(3/1.5/3, 12 m, FAR 2.0, 579 m²) and the real determination never swaps in (L-521) — the user could
act on a generic estimate believing it is the Barcelona rule. This is the MIRROR of R1 and arguably
worse (wrong number, no honest badge). **Mitigation.** ESTIMATED badge is shown honestly while it IS
estimated; L-521 fix (pending the console probe) must guarantee the real determination replaces the
placeholder, or the placeholder must not read as the site's real allowance. **Do not close R4 until
the estimated→real swap is verified in the draw flow.**

## R5 — 3D-tiles clip mismatch · **LOW · OPEN (L-517)**
**Risk.** The photoreal parcel void doesn't fully match the parcel (facade sliver). Purely visual —
no legal/data consequence; the envelope numbers are unaffected. Tracked separately; not a badging risk.

## R6 — Null-by-design fields must never render as 0 · **MED · MITIGATED**
**Risk.** For a 13a alignment zone, setbacks / max height / max FAR are **NULL by design** (the
"rear setback" IS the profunditat edificable). Rendering them as `0` (or the summary reading "empty"
in a way that implies "no limit") would misstate the allowance. **Mitigation.** They render as `—`;
L-518c will surface the alignment-relevant fields (depth + area) in the summary so "—" is not read as
"unfilled." Never coerce a null zoning field to 0.

## R7 — Data-source availability / staleness · **MED · MONITORED**
**Risk.** Catastro / MUC / Overpass availability varies; a cached empty-success or a source outage
could serve a stale or absent determination (cf. the context-data-honesty family: failure vs empty
are the same value). **Mitigation.** Probe-before-fix discipline; §OVERPASS-ZERO-IS-NOT-AN-ANSWER;
the envelope refuses rather than fabricates. Roads removed from the envelope critical path (L-516).

---

## Sign-off & review
- **Owner:** UNASSIGNED (founder-owned decision on R1). **Review cadence:** before any change to the
  envelope confidence badge or the block-derived depth construction.
- **L-518 status:** fix being implemented (confidence tier for the block-constructed determination +
  honest "real, constructed" badge wording). This register is the condition under which that badge
  ships — the mitigations in R1 (esp. wording + retained caveats) are REQUIRED, not optional.
- **Cross-refs:** L-449 (source acceptance gate), L-518 (badge), L-515 (frontage), L-521 (placeholder),
  L-517 (clip), C58 (confidence model + the MISSING-CONTRACTS gap for a constructed-determination tier),
  ADR-0270 / ADR-0271 (alignment + block-derived depth). Memory: [[barcelona-edificabilitat-is-a-construction]].
