# FIXTURE — a stand-in for BIM30-MASTER-COMPLETION-TRACKER.md

> This file exists so the tests can prove marker-block isolation against a file with
> REAL prose shapes around the markers: a blockquote, a table, footnote-ish links,
> and characters that would break naive line-based splicing.
>
> **Do not "tidy" this file.** Its exact bytes are the assertion. A test reads the
> region before the BEGIN marker and the region after the END marker and requires
> both to be byte-identical after the tool runs.

## ⏱ THE NUMBER — read this line and stop

> ### **41 % COMPLETE · 59 % REMAINING**
> **34 of 82 classified gap-register rows CLOSED** · 33 OPEN · **15 UNPROVEN**

| Row | Status | Gate |
|---|---|---|
| `bar-3` | OPEN | `check-relationship-determination` — does not exist |
| `epsilon-policy` | CLOSED | `check-epsilon-policy` |

Prose with a literal pipe \| and an unmatched `<!-- comment-looking thing` that must
survive untouched, plus a nested quote: "the code is wrong".

<!-- TRACKER:AUTO:BEGIN -->
placeholder — this is replaced wholesale on every run
<!-- TRACKER:AUTO:END -->

## Human prose AFTER the block

This section must also survive byte-identically. It mentions `TRACKER:AUTO` in prose
without being a marker, which is deliberate: the splicer matches the full marker
strings, not a substring.

- A bullet
- Another bullet with a trailing space
