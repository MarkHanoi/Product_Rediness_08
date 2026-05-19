Create and insert into `docs/03_PRYZM3/04-PLAN-FORWARD/11-WAVE-7-CLEANUP-PHASE-F.md` a **full exhaustive codebase-wide Wave 7 → Wave 8 THREE Architectural Ownership Decoupling Master Table**, not a summary table.

## REQUIRED OBJECTIVE

Produce a **massive actionable remediation table** covering **every remaining file / module / package / plugin / app instance** across the entire repository that still violates P2:

> **P2 Rule:** Only `packages/renderer-three/` may directly import or own `THREE`.

This table must specifically enumerate all remaining architectural ownership violations currently referenced in `05-ARCHITECTURE-BREAKDOWN.md` (§8.1 / §9.4), including the historical **467 direct THREE importers**, and convert them into a concrete implementation execution plan.

---

# TABLE REQUIREMENTS

## For EVERY violating instance include:

| Column                 | Description                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Wave                   | Wave 7 or Wave 8                                                                                                     |
| File Path              | Exact repository path                                                                                                |
| Layer                  | app / package / plugin / engine / server                                                                             |
| Violation Type         | direct import / constructor ownership / geometry creation / material creation / scene management / renderer coupling |
| Current THREE Usage    | Exact description of violation                                                                                       |
| Required Refactor      | facade / adapter / renderer-three migration / package extraction / dependency inversion                              |
| Target Owner           | renderer-three / snapping / spatial-index / plugin-sdk / other package                                               |
| Complexity             | Low / Medium / High                                                                                                  |
| Sprint Estimate        | Hours or days                                                                                                        |
| Priority               | Critical / High / Medium                                                                                             |
| Dependency Blockers    | Other systems needing migration first                                                                                |
| Status                 | Open                                                                                                                 |
| Target Wave            | 7A / 7B / 8A / 8B                                                                                                    |
| Validation Requirement | lint rule / codemod / CI gate / architecture audit                                                                   |
| Notes                  | migration specifics                                                                                                  |

---

# IMPLEMENTATION SECTIONS REQUIRED

## Wave 7

* High-volume codemod migrations
* Core engine subsystem decoupling
* Plugin boundary enforcement
* Shared facade creation
* Renderer abstraction rollout
* CI import gate

## Wave 8

* Remaining deep subsystem migrations
* Edge-case plugin cleanup
* Final package extraction
* Full architectural audit
* Permanent governance
* “Zero non-owner THREE imports” enforcement

---

# MANDATORY OUTPUTS

## Add:

### 1. Repository-wide violation inventory

* Every instance
* Grouped by domain
* Sorted by priority

### 2. Execution roadmap

* Sprint-by-sprint
* Ordered by dependency

### 3. Quantitative reduction targets

* 467 → target after Wave 7
* Wave 8 → 0 direct architectural violations

### 4. Governance controls

* ESLint restrictions
* TS path restrictions
* CI blockers
* Architecture ownership policy

### 5. Honest tracker alignment

Update:

* `00-PROCESS-TRACKER.md`
* `05-ARCHITECTURE-BREAKDOWN.md`

---

# SUCCESS CRITERIA

* No vague notes
* No placeholder rows
* No “future work” wording
* Must function as an implementation-grade migration program
* Must explicitly define all remaining work for complete P2 compliance
* Must distinguish:

  * import decoupling
  * runtime decoupling
  * architectural ownership decoupling
  * governance decoupling

---

# END STATE

By completion:

* Wave 7 = majority migration
* Wave 8 = total enforcement
* P2 = fully green
* `renderer-three` = sole THREE owner

---

## IMPORTANT

If repo scan is required, perform a fresh exhaustive codebase scan before generating the table so that the table reflects real remaining violations rather than historical documentation summaries. This must be treated as a live architecture remediation program, not documentation polish.
