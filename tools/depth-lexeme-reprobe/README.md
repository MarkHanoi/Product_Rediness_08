# depth-lexeme-reprobe — re-testing four negatives that were established with `fondo`-shaped searches

Málaga never uses the lexeme `fondo`; it defines **`profundidad edificable`** (Art. 12.2.14). Every
depth probe in the programme searched `fondo`. This tool re-tests the four conclusions that rested
on those searches, plus the two parameter families with the same exposure (setbacks, height).

**A regex that does not match is not an absent field.** The method here is therefore *not* "expand
the wordlist and re-grep": each script **dumps the full field/term union first** and only then
classifies, so a parameter under an unguessed name is visible whether or not anyone thought of it.

## Re-run

```bash
node  tools/depth-lexeme-reprobe/m1-madrid-depth-census.mjs          # no network; reads the committed census
node  tools/depth-lexeme-reprobe/m2-madrid-second-depth-column.mjs   # ~5 min, WFS, 93,839 rows
python tools/depth-lexeme-reprobe/v1-valencia-datamodel.py           # no network; re-extracts the ICV PDF
node  tools/depth-lexeme-reprobe/v2-valencia-regex-delta.mjs         # 5 PDFs; prior regex is the control
MAX_MB=12 N_PKG=45 python tools/depth-lexeme-reprobe/c3-canarias-frugal-harvest.py   # ~25 min
python tools/depth-lexeme-reprobe/c2-canarias-cached-union.py        # analyses whatever is cached
```

`c1-canarias-depth-union.py` is the first, disk-hungry Canarias harvest. It stalled the machine at
<2 GB free on a single 64 MB package; **`c3` supersedes it** by streaming, capping archive size and
deleting each archive after extracting its `.mdb` members. `c1` is retained because its output shape
is the one `c2` reads.

## Controls that earned their place

- **`FonMaxEdm` is Canarias' positive control.** It is known ~2.3 % populated, so a run that cannot
  see it is broken and its zeros are its own. It is asserted in every Canarias artefact.
- **The prior regex is the València control.** `v2` runs the old `fondo`-only pattern and the derived
  one over the same bytes and reports the *delta*, so "the new one finds more" is measured, not argued.
- **Madrid's page walk reconciles against `resultType=hits`** (93,839) and probes WFS 1.0.0/1.1.0/2.0.0,
  because a modern-default-only probe cannot distinguish "service down" from "one version broken".
- **Skipped and failed inputs are counted separately from absent data.** `c3` reports
  `skippedTooBig` / `notZip` / `decodeFail` alongside `rowsRead`; a hole in the denominator is never
  reported as a zero.

## Two defects this tool caught in itself

1. **`v2` manufactured its own zeros.** Three PDFs were logged `NO-TEXT-LAYER` because the child
   Python process died on a Windows `cp1252` encode error hitting glyph U+F02D. Forcing UTF-8 bytes
   on the child's stdout turned 3 "empty" documents into 3 readable ones (34 k, 29 k, 40 k chars).
   Extraction failure is now its own class, `PROBE-FAILED`, and is never collapsed into "no text".
2. **`c3` died on Windows file locking** — the archive was unlinked while its `ZipFile` was still
   open. Fixed with a context manager; the point is that the first version failed *loudly*, which is
   the only reason it did not silently truncate the sample.
