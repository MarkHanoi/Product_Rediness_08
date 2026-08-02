# 0292 — No tool may report a result it cannot verify against ground truth it did not produce

**Status**: ACCEPTED (2026-08-02 — founder: *"Name it once and the fifth instance gets caught by design rather than by luck."*)
**Date**: 2026-08-02
**Deciders**: founder + architecture team
**Related contracts**: [C58](../contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (§1.4 never present a guess as a fact) · [C62](../contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md) · [C63](../contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) (§1.1 every axis % is a total function of inspectable state) · [C64](../contracts/C64-ENVELOPE-COMPILER.md)
**Related ADRs**: [ADR-0283](./ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) · [ADR-0286](./ADR-0286-every-derived-value-exposes-legal-computational-source-and-tier.md) · [ADR-0287](./ADR-0287-resolvers-refuse-when-uncertainty-changes-the-legal-outcome.md) · [ADR-0288](./ADR-0288-machine-readable-is-not-publishable.md) · [ADR-0290](./ADR-0290-exhaust-authoritative-sources-before-engineering-a-derived-solution.md) (its negative-proof conditions are this rule applied to discovery)
**Reference docs**: [PROBE-DISCIPLINE.md](../../04-reference/standards/PROBE-DISCIPLINE.md) · [DATASET-DISCOVERY-PROTOCOL.md](../../04-reference/standards/DATASET-DISCOVERY-PROTOCOL.md)

## Context

Four defects on **2026-08-02**, in four unrelated tools, written by four different agents. Each produced a
result that was **confident, silent, internally consistent, and wrong** — and not one was detectable from
inside the thing that produced it.

| # | Tool | What it reported | What was true |
|---|---|---|---|
| 1 | WFS probe | `0 features` — HTTP 200, no error | 3 features. The bbox axis order was lat,lon; the service wanted lon,lat |
| 2 | locality gate | layer is **11,955 km away** → quarantined | A genuine PGOU layer. The service published EPSG:25830 **metres** inside an `ows:WGS84BoundingBox` element |
| 3 | ghost-test sweep | `tools/ga-gate/**` executes in no script | It is explicitly in the root vitest globs. An **apostrophe inside a config comment** — *"the bake's footprint reader"* — broke naive quote-pairing and swallowed every glob after it |
| 4 | `computeScorecard.test.ts` | docstring: *"Run: … (the `test:pryzm1` runner)"* | That runner's glob was `tests/*.test.ts` and never matched the file. **31 green tests executed in no script**, guarding the C63 scorecard every coverage figure traces through |

**#4 is the sharpest and is a different failure from the other three.** Orphaning is silence. This was a
**false positive claim**: a reader checking whether the scorecard was tested would have found the docstring,
believed it, and stopped. The artefact asserted its own coverage while executing nowhere.

**Every one of the four was caught by an assertion against external ground truth — and only because someone
happened to check.** #1 and #2 by hand-probing a second parameterisation; #3 because four known-covered
files were asserted before the count was trusted; #4 because the file was being landed at the moment.
**Luck, four times.** The fifth instance has no reason to be lucky.

## Decision

> **No tool may report a result it cannot verify against ground truth it did not produce.**

A tool that computes an answer must also, in the same run, check that answer against **something it did not
generate itself** — a pinned fixture, a known-good set, an independent parameterisation, a second source —
and must **fail loudly rather than print** when that check does not hold.

**The four existing rules are this invariant applied in four places, and are hereby named as instances:**
- the **negative-proof conditions** (ADR-0290): a negative resting on a 403, an untested axis order, an
  unverified CRS or an unexercised alternate parameterisation **is not a negative**;
- the **known-good fixture assertion**: the ghost-test sweep must find a pinned list of covered files before
  it may print a count;
- the **`f_fin` / temporal-validity check**: geometry served without checking its own validity field is not
  current geometry;
- the **scorecard's schema assertion**: the tool's output validates against the L0 schema, which it does not
  author.

## Consequences

- **Self-consistency is not evidence.** All four defects were internally coherent. A tool agreeing with
  itself tells you nothing; the check must cross a boundary the tool does not control.
- **`UNKNOWN` must be reachable from every verification path.** Where ground truth is unavailable, the
  honest output is `unknown` with the reason — never the unverified result (ADR-0283).
- **A ground-truth assertion is not an optional extra test.** It is a **precondition of printing**. The
  sweep asserts before it counts; the discovery tool asserts against its known-good set before it emits.
- **Documentation is an output and is subject to this rule.** A docstring naming a runner is a claim about
  the world. A one-off scan (2026-08-02) found **14 test files claiming a runner, 1 uncollected** — and that
  one's claim (*"locally once Playwright is installed"*) is an honest caveat, so the class is closed. It was
  closed by checking, not by assuming.
- **This does not license unbounded self-checking.** The assertion must be against *external* truth and must
  be cheap enough to run every time. A check the tool computes from the same inputs is decoration.
- ⚠ **When a verification tool is itself wrong, say so with its history.** The ghost-test sweep took three
  attempts and was wrong twice (`**/` not matching zero segments; the apostrophe). That history is part of
  the finding, not a footnote — a verification tool with no error history has usually not been verified.
