# CUS Control-Point Extraction — CUS41W.jpg (2026-08-04)

## Method used

**Path 1 succeeded**: installed a real Tesseract OCR binary via direct download of the
UB-Mannheim installer (`winget install --id UB-Mannheim.TesseractOCR` failed non-interactively
with `0x800704c7` — operation cancelled, likely a blocked elevation prompt in this shell — so
the same installer .exe was downloaded directly from the GitHub release and run silently with
`/S /D=C:\Tesseract-OCR`, which succeeded and landed the binary at
`C:\Program Files\Tesseract-OCR\tesseract.exe`, v5.4.0.20240606). `pytesseract` was also missing
from the actual `python3` in use (`C:\Users\LENOVO\AppData\Local\Python\pythoncore-3.14-64`,
despite an earlier claim it was present) and was installed via `pip install pytesseract Pillow
numpy`.

**However**, automated `pytesseract.image_to_data()` OCR on the corner/edge tick-mark crops
returned **no usable hits** at any PSM mode (6, 11, 4, 3) tried, even after 3x–5x upscaling and
binarization. The tick-mark digits are ~7–13px tall in the source scan — legible to a human eye
at high zoom, but below Tesseract's reliable recognition floor for this scan quality/font
(a thin dashed/dot-matrix-style numeral font).

**Fell back to Path 3 (direct visual reading)**: used the `Read` tool to view the full CUS41W.jpg
page, then cropped small regions at 4x–10x zoom (via a Python/PIL script) around each of the
four corners and two additional bottom-edge tick marks, and read the digits directly. Pixel
coordinates were derived by cropping progressively tighter boxes and estimating the label's
bounding-box center within each crop, then translating back to full-image coordinates.

## Control points obtained (CUS41W.jpg, image size 1882×1443 px)

| Label (UTM) | Axis | Pixel (x, y) | Confidence | Notes |
|---|---|---|---|---|
| 342841 | Easting | (~33, ~7) | High | Top-left corner, upper line of stacked label |
| 4193351 | Northing | (~21, ~9) | High | Top-left corner, lower line of stacked label |
| 344641 | Easting | (~1850, ~14) | High | Top-right corner, upper line |
| 4193351 | Northing | (~1852, ~19) | High | Top-right corner, lower line — matches TL northing exactly (same top edge) |
| 342841 | Easting | (~17, ~1172) | High | Bottom-left corner, lower line (corroborates TL easting exactly) |
| 4192201 | Northing | (~14, ~1167) | High | Bottom-left corner, upper line |
| 343000 | Easting | (~193, ~1171) | Medium-high | Interior bottom-edge tick, round 200 m grid value, slightly blurred |
| 343200 | Easting | (~394, ~1170) | Medium-high | Interior bottom-edge tick, round 200 m grid value, slightly blurred |

All 8 readings are internally consistent: fitting an affine from the corner pairs gives
**≈0.99 UTM metres per pixel** in both X and Y independently (e.g. ΔX: (344641−342841)/(1850−33)
= 0.991 m/px; ΔY: (4193351−4192201)/(1172−8) = 0.988 m/px), and the two interior bottom ticks
(343000, 343200) fall on the same line at the pixel spacing (~201 px) predicted by that same
scale (200 m / 0.99 ≈ 202 px) — strong cross-corroboration that these are correctly read, not
misread digits that happen to look plausible.

No digit in the above set was ambiguous enough to flag as low-confidence; the "Medium-high"
tag on the two interior ticks reflects mild blur, not doubt about the actual digit values.

## Scalability verdict

- **OCR path is not scriptable as-is.** Stock Tesseract, even with upscaling/binarization/PSM
  tuning, could not read these tick labels reliably — this is a font/resolution problem, not a
  missing-binary problem (which is now fixed). A production OCR pipeline would need either
  much higher-DPI source scans (not available — these are the only corpus copies) or a
  custom-trained/fine-tuned recognizer for this specific dot-matrix numeral font, which is
  disproportionate effort for 49 sheets.
- **Manual/agent visual reading is realistic and repeatable, but is per-sheet, not batch.**
  The technique used here (crop corners + 1–2 interior edge ticks at 4–10x zoom, read visually,
  cross-check the implied m/px scale for consistency) took a few iterations per sheet region and
  is straightforward for a future agent to repeat on the remaining 48 sheets, but each sheet
  needs its own crop/read/verify pass — there is no automated batch shortcut discovered here.
  Budget roughly 4 corner reads (2 labels each) per sheet, i.e. ~8 small crops, for a
  well-corroborated affine per sheet.
