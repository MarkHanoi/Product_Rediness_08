#!/usr/bin/env python3
"""Stamp the height datum + sampling rule onto nz4.json.

nz4.json is hand-transcribed (it is NOT emitted by build_records.py), so it cannot pick up
the HEIGHT_DATUM table through the normal generate path. This script applies the same table
to it in place, so there is exactly one source of truth for the datum across all seven files.

Idempotent — safe to re-run. Run it after build_records.py:

    python tools/madrid-extract/build_records.py
    python tools/madrid-extract/stamp_nz4.py
    python tools/madrid-extract/validate.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_records import stamp_height_datums  # noqa: E402

DEFAULT = os.path.join("docs", "04-reference", "jurisdictions", "es", "es-md",
                       "28079-madrid", "extracted", "nz4.json")

# The pass-01 note that recorded the datum as an OPEN GAP. Superseded by this pass; kept on
# the record under `referencePlaneNoteSuperseded` so the audit trail survives.
STALE_NOTE_MARKER = "outside the scope read"


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)

    touched = 0
    for r in doc["records"]:
        if r.get("parameter") not in ("maxHeight_m", "maxFloors"):
            continue
        note = r.pop("referencePlaneNote", None)
        if note and STALE_NOTE_MARKER in note:
            r["referencePlaneNoteSuperseded"] = note
        elif note:
            r["referencePlaneNote"] = note
        touched += 1

    stamp_height_datums(doc["records"])

    doc["$meta"]["heightDatumPass"] = {
        "resolved": "2026-07-31",
        "closes": "COMPENDIO-2025-EXTRACTION-01.md §8.6 — 'NZ 4's height table gives altura de cornisa with no stated datum'.",
        "answer": "rasante de la acera, sampled on the vertical through the PUNTO MEDIO DE LA LÍNEA DE FACHADA (art. 6.6.8 apartado 6.a), PDF p205; general definition art. 6.3.5 apartado c), PDF p193).",
        "samplingIsStated": True,
        "findings": "findings/COMPENDIO-2025-HEIGHT-DATUM-AND-NZ7.md",
        "notModelled": [
            "Art. 6.6.8.2's independent 2:1 cornisa/street-width cap ('no podrán guardar una relación entre la altura de cornisa en metros y ancho de calle superior a la proporción 2:1'). It can REDUCE the 8.4.10 table height on streets narrower than 5,75 m (11,50/2). Its escape clause ('salvo para aquellas zonas en que fuera preciso superarla por la aplicación de reglas de colindancia o condiciones estéticas') is discretionary and unquantified. Not emitted as a record: it is a cross-parameter rule, not a per-zone value.",
            "altura total. NZ 4 fixes only cornisa. The true silhouette ceiling is derived — cornisa + 400 cm for stair/lift housings (art. 6.6.11.1.b) or the 45° roof plane (art. 6.6.11.1.a), whichever governs — and is therefore NOT emitted as a value.",
        ],
    }

    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    nulls = sum(1 for r in doc["records"] if r["value"] is None)
    print(f"{path}: {len(doc['records'])} records, {touched} height records stamped, null={nulls}")


if __name__ == "__main__":
    main()
