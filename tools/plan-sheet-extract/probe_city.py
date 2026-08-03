"""Run the plan-sheet capability against any configured city.

    python tools/plan-sheet-extract/probe_city.py huesca
    python tools/plan-sheet-extract/probe_city.py valencia

Answers, per sheet and WITHOUT converting anything into a planning number:
    1. is the sheet DATA?                     (vector / raster / indeterminate)
    2. does it publish its own georeference?   (GeoPDF /Measure, TerraGo LGIDict)
    3. does it publish its own layer names?    (OCG names = an authored legend)
    4. is its line work DIFFERENTIATED?        (stroke-class census)
    5. does its legend bind?                   (only where a human has read it)

Out: tools/plan-sheet-extract/out/<city>_plan_sheets.json
"""

from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import plansheet as ps  # noqa: E402
from cities import CITIES  # noqa: E402

OUT = os.path.join(HERE, "out")
CACHE = os.path.join(OUT, "pdf_cache")


def main() -> None:
    key = (sys.argv[1] if len(sys.argv) > 1 else "huesca").lower()
    if key not in CITIES:
        raise SystemExit(f"unknown city {key!r}; known: {sorted(CITIES)}")
    cfg = CITIES[key]
    os.makedirs(OUT, exist_ok=True)

    report: dict = {
        "probe": "plan-sheet-extract",
        "city": cfg["city"],
        "ine": cfg["ine"],
        "catastro_dgc": cfg["catastro_dgc"],
        "status": cfg["status"],
        "instrument": cfg["instrument"],
        "notes": cfg["notes"],
        "sheets": [],
    }

    if not cfg["sheets"]:
        report["OUTCOME"] = "NOT_RUN"
        report["why"] = (
            "no sheet URLs are configured for this city. ⛔ This is UNTESTED, not "
            "a finding that the sheets are unusable — no request was made, so "
            "nothing was learned."
        )
        _write(key, report)
        return

    if ps.fitz is None:
        report["OUTCOME"] = "UNKNOWN"
        report["why"] = "PyMuPDF (fitz) is not installed; nothing was measured"
        _write(key, report)
        return

    for sheet, url in cfg["sheets"].items():
        print(f"  {sheet} ...")
        cache = os.path.join(CACHE, f"{key}_{sheet}.pdf")
        data, outcome = ps.fetch_pdf(url, cache)
        if data is None:
            report["sheets"].append(
                {
                    "sheet": sheet,
                    "outcome": "UNKNOWN",
                    "transport": outcome,
                    "why": "no HTTP status obtained; nothing learned about the sheet",
                }
            )
            continue

        rec = {
            "sheet": sheet,
            "outcome": "MEASURED",
            "transport": outcome,
            "anatomy": ps.sheet_anatomy(data),
            "published_georeference": ps.published_georeference(data),
            "named_layers": ps.named_layers(data),
        }

        doc = ps.fitz.open(cache)
        page = doc[0]
        rec["page"] = {
            "rect_display": list(page.rect),
            "mediabox": list(page.mediabox),
            "rotation": page.rotation,
        }
        rec["stroke_census"] = ps.stroke_census(page)

        if cfg["scale_denominator"]:
            mpp = ps.metres_per_point(cfg["scale_denominator"])
            rec["scale"] = {
                "published_denominator": cfg["scale_denominator"],
                "metres_per_point": mpp,
                "ground_extent_m": [
                    round(page.rect.width * mpp, 1),
                    round(page.rect.height * mpp, 1),
                ],
                "fitted": False,
            }
            rings = ps.closed_rings(page, scale=mpp)
            building_scale = [r for r in rings if 60.0 <= r["area"] <= 4000.0]
            rec["geometry"] = {
                "closed_rings": len(rings),
                "building_scale_rings_60_4000_m2": len(building_scale),
            }

        if cfg["legend_rows"]:
            rec["legend"] = ps.bind_legend(page, cfg["legend_rows"])
        else:
            rec["legend"] = {
                "outcome": "NOT_READ",
                "why": (
                    "a legend binds only after a human has read the captions off a "
                    "render once. Not done for this city."
                ),
            }
        report["sheets"].append(rec)
        doc.close()

    measured = [s for s in report["sheets"] if s["outcome"] == "MEASURED"]
    report["OUTCOME"] = "MEASURED" if measured else "UNKNOWN"
    report["summary"] = {
        "anatomy_verdicts": sorted({s["anatomy"]["VERDICT"] for s in measured}),
        "georeference_verdicts": sorted(
            {s["published_georeference"]["VERDICT"] for s in measured}
        ),
        "sheets_with_named_layers": sum(1 for s in measured if s["named_layers"]),
        "REMINDER": (
            "vector + differentiated line work is NECESSARY, NOT SUFFICIENT. Without "
            "a georeference AND an unambiguous legend, no line here may become a "
            "metre on the ground."
        ),
    }
    _write(key, report)


def _write(key: str, report: dict) -> None:
    path = os.path.join(OUT, f"{key}_plan_sheets.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
    print(f"\nOUTCOME: {report.get('OUTCOME')}")
    for s in report.get("sheets", []):
        if s["outcome"] != "MEASURED":
            print(f"  {s['sheet']}: {s['outcome']}")
            continue
        g = s.get("geometry", {})
        print(
            f"  {s['sheet']}: {s['anatomy']['VERDICT']} | "
            f"{s['published_georeference']['VERDICT']} | "
            f"{s['stroke_census']['distinct_classes']} stroke classes | "
            f"colour={s['stroke_census']['is_colour']} | "
            f"rings={g.get('building_scale_rings_60_4000_m2', 'n/a')} | "
            f"legend={s['legend'].get('counts', s['legend'].get('outcome'))}"
        )
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
