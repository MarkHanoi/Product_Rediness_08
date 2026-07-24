# Rate Implementation Plan — Antwerp (`be-vlg-antwerp`) city

**Current rate:** ~0–5% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~20–25% ·
**Gap to ceiling:** ~15–25 pts · **Gap to Denmark (~96%):** ~71–96 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Antwerp's realistic ceiling is **~20–25%** — the middle tier of the three Belgian cities (above
Liège, below Brussels). This ceiling is set by a structural constraint that no amount of
data-engineering can overcome: **Flanders' VCRO explicitly treats "no numeric ceiling" as a
legitimate, frequently-chosen legal answer, not a data gap**.

The ceiling is reached by filling every parcel that falls into one of the two fill-eligible
categories:
- **RUPs with explicit numeric height provisions** that (a) predate 1 September 2009 or are
  absolute rather than percentage-based, and (b) survive the Art. 7.4.2/2 nullification check.
- **Parcels still governed by the gewestplan** where the gewestplan affectation, combined with a
  confirmed gemeentelijke stedenbouwkundige verordening, supplies a numeric provision.

For all other parcels — those under a RUP with "vrij" height, those under post-2009
percentage-based provisions — the correct output is a *goede ruimtelijke ordening* refusal. That
refusal fraction is the gap between the ceiling and Denmark's ~96%.

**The fraction of Antwerp parcels in each category is unknown until the DSI WFS is probed live.**
The ~20–25% ceiling is an estimate based on analogous jurisdictions where plan-by-plan numeric
provision frequency was measured (Germany's XPlanGML structured-field completeness study is the
closest parallel). It could be revised upward (if Antwerp's RUPs are unusually numerically
specified) or downward (if "vrij" is even more prevalent than in the regional average) once the
DSI access block is resolved.

**Denmark comparison:** Denmark hits ~96% because Plandata delivers height and density metric as
structured fields for every plan polygon — no PDF reading, no discretionary judgment. Antwerp's gap
is structural: Flanders has no equivalent of Plandata. Even a fully functioning DSI pipeline would
still route most Antwerp envelope questions through a PDF-linked voorschriften document and a
mandatory *goede ruimtelijke ordening* test.

**Barcelona comparison (pilot model):** Barcelona climbed by using block-derived geometry to compute
envelopes where no per-parcel structured field existed. Flanders has no equivalent computable rule
(Antwerp's height is either stated in the RUP text or left "vrij" — there is no formula equivalent
to Barcelona's *edificabilitat* or Brussels' H = P + 3.00 + D). Antwerp's climb is therefore
narrower: it is limited to finding and extracting existing numeric provisions from RUP voorschriften
PDFs, not computing envelopes from geometry.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — endpoint/schema checks; write RATE.md; identify the four-step instrument cascade | Honest baseline: ~0–5% confirmed; structural gap (vrij + Art. 7.4.2/2) characterised | — → ~0–5% | Complete | VERIFIED | UNASSIGNED |
| **1** | Resolve Flanders DSI robots-block: probe `mercator.vlaanderen.be` or an alternative Flanders WFS endpoint; confirm live gewestplan/RUP layer access | Live DSI `lu:lu_si_gv` + `lu:lu_gewrup_*` + `lu:lu_hov_*` GetFeature operational — prerequisite for all subsequent phases | ~0–5% → ~0–5% (access unblocked; rate unchanged) | Low–Medium | NOT STARTED | UNASSIGNED |
| **2** | Run measurement probes: (a) what fraction of Antwerp parcels are under a superseding RUP vs. still-active gewestplan (grid-sample); (b) what fraction of Antwerp RUPs state an explicit numeric height provision vs. "vrij" (sample RUP voorschriften PDFs); (c) confirm Antwerp DHMV II coverage via GRB LOD1 direct access | Converts unknowns to measurements; sets the real ceiling and the dev-day budget; confirms whether gemeentelijke verordening exists with numeric content | ~0–5% → ~0–5% (measurements only; no fills yet) | Medium | NOT STARTED | UNASSIGNED |
| **3** | Build the four-step Flanders instrument cascade: (a) gewestplan/RUP determination via DSI `lu:lu_si_gv`; (b) numeric provision extraction from voorschriften PDF link; (c) Art. 7.4.2/2 nullification check via `lu_hov_*`; (d) "vrij" refusal output | Each Antwerp parcel gets a correct instrument label and either a numeric fill or a correctly-attributed refusal; no more `regime-undetermined` outputs | ~0–5% → ~8–15% (fill from RUPs with confirmed numeric provisions; refusals for "vrij" and nullified provisions) | High — four-step cascade; PDF extraction pipeline; requires Phase 1 complete | NOT STARTED | UNASSIGNED |
| **4** | Confirm and ingest Antwerp gemeentelijke stedenbouwkundige verordening (if adopted) for municipal numeric provisions layered on top of RUP | If a municipal ordinance with numeric provisions exists: additional fill for parcels where the RUP is silent or "vrij" at the RUP level but the verordening supplies a number | ~8–15% → ~12–20% | Low–Medium (document sourcing + provenance) | NOT STARTED | UNASSIGNED |
| **5** | Human `VERIFICATION.md` sign-off per sourced RUP/verordening; obtain clause-level citations for every numeric provision shipped | Lifts confirmed provisions from `estimated-ruleset` to `structured`; closes the L-449 human-verification gate | ~12–20% → ~20–25% (ceiling) | Low per instrument (ongoing gate) | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

The gap has three structural components:

**(a) "Vrij" height — the deliberate legal non-answer.** Denmark's Plandata includes a height field
in every plan polygon. Flanders' RUPs include a "vrij" option that is the legally correct answer
for a meaningful fraction of parcels. No data pipeline fills a deliberately absent number — the gap
here is permanent without a policy change (adopting a Flanders-wide numeric height baseline,
analogous to Brussels' RRU Titre I or Denmark's Plandata field).

**(b) Provision-code catalogue absence.** Sweden's Planbestämmelsekatalog maps ~3,700 plan-provision
codes to numeric meaning, enabling automated extraction without reading each PDF. Flanders has no
such catalogue — every numeric RUP provision must be read from the voorschriften PDF individually
and transcribed with a human verification gate. This limits throughput to however many RUPs can be
sourced under the L-449 process, not to the full Antwerp RUP corpus at once.

**(c) Art. 7.4.2/2 statutory nullification.** Post-2009 percentage-based provisions are voided by
statute — a uniquely Flemish mechanism with no parallel in any other studied jurisdiction.
The `lu_hov_*` tracking layer in the DSI (confirmed in cached capabilities) provides an automated
flag for these provisions, but the check must run before any % provision is shipped as a live value.
This is a cost-of-correctness requirement, not a fill-rate driver.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Blockers:**
- **Phase 1 (DSI robots-block):** the prerequisite for all Antwerp fill work. The `mercator.
  vlaanderen.be` endpoint is the priority alternative to probe; if it also blocks, Digitaal
  Vlaanderen's published data-sharing agreements are the next path.
- **Phase 2 (measurement probes):** must complete before committing to Phase 3 dev-day scope.
  If the "vrij" fraction is very high (>70%), the ceiling drops below ~20% and Phase 5 scope
  shrinks accordingly.
- **Phase 3 (PDF extraction pipeline):** Flanders' RUP voorschriften are linked as PDF URLs from
  the DSI `lu:lu_si_gv` features. The extraction pipeline is similar to the France/Germany
  transcription pipelines (ordinance PDF → clause-cited numeric value + L-449 human gate), but the
  "vrij" and Art. 7.4.2/2 checks are Flanders-specific pre-flight steps that must run first.

**Cross-jurisdiction reuse:**
- The federal CADMAP ingestion (parcel geometry) built for Brussels also serves Antwerp — one build,
  three-region benefit.
- The L-449 human-verification gate (clause citation → human sign-off → `structured` tier) is the
  same gate used in every other jurisdiction; the per-RUP `VERIFICATION.md` sign-off follows the
  same flow as the Saudi Arabia footprint clauses or the Barcelona plan pack.
- The Art. 7.4.2/2 `lu_hov_*` check is Flanders-specific — no direct reuse in Brussels/Wallonia —
  but the temporal-validity pattern (adoption date + provision type → void/valid decision) is
  analogous to any other jurisdiction that tracks instrument vintage.
- The `regime-undetermined` and `legal` (vrij) refusal vocabulary defined for Antwerp also serves
  the Brussels and Liège packs; define the vocabulary once and share it.

**Governing documents:** C58 (fidelity/provenance) · ADR-0269 (curate-then-serve) · L-449
(human-verification gate) · VCRO (Vlaamse Codex Ruimtelijke Ordening, codified 2009; Art. 4.3.1
goede ruimtelijke ordening; Art. 7.4.2/2 clichering) · loi spéciale 8-08-1980 (Flanders devolution).

---

*Model references: **Denmark** `../../../dk/` (ceiling, ~96%) · **Barcelona**
`../../../es/es-ct/08019-barcelona/` (pilot climb — phase shape mirrors Antwerp's per-RUP
sourcing). Governing: **C58** · **ADR-0269** · **L-449**.*

*Last updated: 2026-07-24. Maintainer: UNASSIGNED.*
