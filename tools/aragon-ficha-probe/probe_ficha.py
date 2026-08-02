#!/usr/bin/env python3
"""
ARAGON FICHA PROBE  (A1)
========================
Tests the OFFICIALLY PUBLISHED ficha URL pattern

    https://idearagon.aragon.es/fichaDescarga/fichaDescarga_<CMUNIINE>.html

published by Aragon Open Data's RDF for Fraga (INE 22112).

DISCIPLINE
----------
* HTTP 200 IS NOT SUCCESS. We classify CONTENT vs SHELL by measuring how much
  VISIBLE TEXT survives after <script>/<style>/tag stripping. A JS-rendered
  stub is a SHELL and is reported as such.
* POPULATED IS NOT PRESENT. We never report a "non-null" rate. For every
  buildability term we report whether a term appears AND whether a parseable
  NUMERIC VALUE is bound to it. A label with no number is NOT a value.
* KNOWN-ANSWER CONTROL in every run: the page MUST contain the municipality's
  own name. If the control fails the run is void, not zero.
* UNKNOWN NEVER NO.

Usage:  python probe_ficha.py            # default seeded sample
        python probe_ficha.py 22112 50297 44216
"""

from __future__ import annotations

import html
import json
import os
import re
import sys
import urllib.error
import urllib.request

BASE = "https://idearagon.aragon.es/fichaDescarga/fichaDescarga_{code}.html"

# Host is robots-disallowed to crawlers; the brief mandates a browser UA.
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

# SEEDED, RE-RUNNABLE SAMPLE.
# Not random: one published existence proof + a stratified spread across all
# three provinces and across settlement size, because a pattern that only
# works for the capitals is not a pattern.
SAMPLE: list[tuple[str, str, str]] = [
    # code   , expected municipality name , why this one is in the sample
    ("22112", "Fraga",     "PUBLISHED existence proof (Aragon Open Data RDF), Huesca, mid-size"),
    ("50297", "Zaragoza",  "provincial capital + regional capital, Zaragoza"),
    ("22125", "Huesca",    "provincial capital, Huesca"),
    ("44216", "Teruel",    "provincial capital, Teruel"),
    ("50095", "Calatayud", "non-capital mid-size, Zaragoza"),
    ("22199", "Sabinanigo", "small mountain municipality, Huesca"),
]

# Buildability terms. `edificabilidad` / `altura` / `plantas` / `ocupacion` are
# the four the brief names; the rest bound the question.
TERMS = {
    "altura":          r"altura",
    "plantas":         r"plantas?\b",
    "edificabilidad":  r"edificabilidad",
    "ocupacion":       r"ocupaci[oó]n",
    "aprovechamiento": r"aprovechamiento",
    "densidad":        r"densidad",
    "retranqueo":      r"retranqueo",
    "fondo_edificable": r"fondo\s+edificable",
    "alineacion":      r"alineaci[oó]n",
    "planeamiento":    r"planeamiento",
    "pgou":            r"\bPGOU\b",
    "normas_urb":      r"normas\s+urban[ií]sticas",
    "fiab_geom":       r"fiab_geom",
    "notepa":          r"\bNOTEPA\b",
}

# A term is only a VALUE if a number is bound to it within a short window.
# e.g. "altura maxima: 12,5 m"  /  "edificabilidad 1,2 m2/m2"
VALUE_WINDOW = 60


def strip_to_text(raw: str) -> str:
    """Visible text only: scripts, styles and tags removed."""
    s = re.sub(r"(?is)<script.*?</script>", " ", raw)
    s = re.sub(r"(?is)<style.*?</style>", " ", s)
    s = re.sub(r"(?is)<!--.*?-->", " ", s)
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def fetch(url: str) -> tuple[int, str, str | None]:
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode("utf-8", errors="replace"), None
    except urllib.error.HTTPError as e:
        return e.code, "", f"HTTPError {e.code} {e.reason}"
    except Exception as e:  # noqa: BLE001
        return 0, "", f"{type(e).__name__}: {e}"


def term_report(text: str) -> dict:
    """For each term: does the LABEL appear, and is a NUMBER bound to it?

    Reporting the label count alone would be exactly the mistake Aragon itself
    taught the programme (populated != present). A label with no bound number
    is recorded as label_only.
    """
    out = {}
    low = text.lower()
    for name, pat in TERMS.items():
        hits = list(re.finditer(pat, low, re.I))
        with_value = 0
        examples: list[str] = []
        for m in hits:
            window = text[m.end(): m.end() + VALUE_WINDOW]
            if re.search(r"\d+(?:[.,]\d+)?", window):
                with_value += 1
                if len(examples) < 3:
                    snippet = text[max(0, m.start() - 30): m.end() + VALUE_WINDOW]
                    examples.append(re.sub(r"\s+", " ", snippet).strip())
        out[name] = {
            "label_hits": len(hits),
            "hits_with_number_nearby": with_value,
            "examples": examples,
        }
    return out


def probe(code: str, expect_name: str, note: str) -> dict:
    url = BASE.format(code=code)
    status, raw, err = fetch(url)

    rec: dict = {
        "cmuniine": code,
        "expected_municipality": expect_name,
        "sample_reason": note,
        "url": url,
        "http_status": status,
        "error": err,
    }

    if not raw:
        rec["verdict"] = "UNREACHABLE"
        return rec

    text = strip_to_text(raw)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f"ficha_{code}.html"), "w", encoding="utf-8") as fh:
        fh.write(raw)
    with open(os.path.join(OUT, f"ficha_{code}.txt"), "w", encoding="utf-8") as fh:
        fh.write(text)

    # ---- KNOWN-ANSWER CONTROL -------------------------------------------
    # The page must name the municipality we asked for. Without this a
    # generic template served for every code would read as a success.
    norm = lambda s: re.sub(r"[^a-z]", "", s.lower().replace("ñ", "n")
                            .replace("á", "a").replace("é", "e").replace("í", "i")
                            .replace("ó", "o").replace("ú", "u"))
    control_ok = norm(expect_name) in norm(text)
    rec["control_municipality_named"] = control_ok

    # ---- CONTENT vs SHELL -----------------------------------------------
    # A shell is mostly markup and script with almost no rendered prose.
    rec["raw_bytes"] = len(raw)
    rec["visible_text_chars"] = len(text)
    rec["text_ratio"] = round(len(text) / max(1, len(raw)), 4)
    rec["is_shell"] = len(text) < 2000
    rec["verdict"] = "SHELL" if rec["is_shell"] else "CONTENT"

    title = re.search(r"(?is)<title>(.*?)</title>", raw)
    rec["title"] = html.unescape(title.group(1)).strip() if title else None

    rec["terms"] = term_report(text)

    # Downloadable resources advertised on the page (the ficha is a DOWNLOAD
    # sheet; what it links to matters as much as what it renders).
    links = re.findall(r'(?i)href="([^"]+)"', raw)
    exts: dict[str, int] = {}
    for h in links:
        m = re.search(r"\.(zip|pdf|dwg|dxf|gml|shp|kml|kmz|csv|xlsx?|json|gpkg)(?:$|\?)", h, re.I)
        if m:
            exts[m.group(1).lower()] = exts.get(m.group(1).lower(), 0) + 1
    rec["downloadable_ext_counts"] = exts
    rec["total_links"] = len(links)
    # Any count landing exactly on 1000/2000/3000 is a truncation suspect.
    rec["truncation_suspect"] = len(links) in (1000, 2000, 3000)

    return rec


def main() -> None:
    codes = sys.argv[1:]
    if codes:
        sample = [(c, "", "cli-supplied") for c in codes]
    else:
        sample = SAMPLE

    results = [probe(c, n, why) for c, n, why in sample]

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "ficha_probe_results.json"), "w", encoding="utf-8") as fh:
        json.dump(results, fh, indent=2, ensure_ascii=False)

    print("=" * 78)
    print("ARAGON FICHA PROBE — fichaDescarga_<CMUNIINE>.html")
    print("=" * 78)
    for r in results:
        print(f"\n[{r['cmuniine']}] {r['expected_municipality'] or '?'} "
              f"-> HTTP {r['http_status']} {r.get('verdict')}")
        if r.get("error"):
            print(f"    error: {r['error']}")
            continue
        print(f"    title            : {r.get('title')}")
        print(f"    control(name on page): {r.get('control_municipality_named')}")
        print(f"    raw {r.get('raw_bytes')}B  visible text {r.get('visible_text_chars')} chars "
              f"(ratio {r.get('text_ratio')})")
        print(f"    links {r.get('total_links')}  downloads {r.get('downloadable_ext_counts')}"
              f"  truncation_suspect={r.get('truncation_suspect')}")
        print("    TERMS (label_hits / with_number_nearby):")
        for k, v in (r.get("terms") or {}).items():
            flag = ""
            if v["label_hits"] and not v["hits_with_number_nearby"]:
                flag = "   <- LABEL ONLY, NO VALUE"
            print(f"      {k:<18} {v['label_hits']:>4} / {v['hits_with_number_nearby']:<4}{flag}")
            for ex in v["examples"]:
                print(f"            e.g. {ex[:150]}")

    ok = [r for r in results if r.get("verdict") == "CONTENT"]
    print("\n" + "=" * 78)
    print(f"CONTENT pages: {len(ok)}/{len(results)}")
    print("=" * 78)


if __name__ == "__main__":
    main()
