# NEXT — Netherlands (`nl`)

> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** DORMANT — context-data spike
> only (`README.md`); the **legal/zoning layer (omgevingsplan) is not started**.

## 1 — WHERE WE STOPPED
Context-data spike only. No parcel/zoning legal work. The Netherlands has unusually strong open geodata
(BAG buildings, BGT, PDOK, AHN LiDAR) — likely a **higher structured ceiling** than Spain — but this is
UNVERIFIED here.

## 2 — THE NUMBER
Zoning full-envelope resolution: **0% (not started).**

## 3 — BLOCKERS
### 3.1 — Legal/zoning layer not begun
- Post-2024 zoning is the municipal **omgevingsplan** under the Omgevingswet, published via **DSO /
  ruimtelijkeplannen(.nl) → Regels op de kaart**. **RESUME STEP.** Run P1: does the DSO API return
  rule objects (height/FSI) as structured data per location, or only plan text? Classify each source.
### 3.2 — Context endpoints unverified (`README.md`).

## 4 — TRIP-WIRES
- **4.1 — A DSO / STOP-TPOD rule reader** → if NL rules come as structured objects, that is a template
  for any jurisdiction moving to digital-rule publishing; verify before assuming.
- **4.2 — AHN LiDAR** → national surveyed heights; feeds the nDSM module and a 12b-style neighbour check.

## 5 — WHAT IS ALREADY BUILT
- The context-data spike analysis (`README.md`).

## 6 — VERIFIED SOURCES
None live-probed yet — leads only.

## 7 — DEAD ENDS
- (none recorded yet)

## 8 — THE SMALLEST NEXT STEP
Query the DSO "Regels op de kaart" API at one address and see whether numeric building rules come back
as data. Add `nl-<subdiv>/` + `<CBS>-<slug>/` only then.

> **Note (2026-07-30):** this §8 is the DSO probe = **Phase D0** of the C63 composite roadmap
> ([`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md)). But under the C63 axes it is **no
> longer the first move** — the cheap already-wired physical axes bank first. **First move = Phase A:
> run `computeParcelConfidence` over an Amsterdam bbox against the already-registered
> `KadasterBRKParcelProvider` (`pdok-nl`)** → moves PARCEL (15 %) from `not-assessed` to measured with
> near-zero risk. Then Phase B (3DBAG heights) → Phase C (AHN terrain verify) → Phase D (this DSO probe
> + omgevingsplan pack). NL is the closest audited country to Denmark's ~96 % machine-readable ceiling.
