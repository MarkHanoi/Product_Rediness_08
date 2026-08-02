"""C0 step 1 - harvest the ENTIRE opendata.sitcan.es CKAN catalogue.

Walks package_search with an EXPLICIT sort (a stalling/repeating walk is usually
a missing ORDER, not a server limit) and reconciles the walk against the API's
own `count` field used as an ORACLE. Also cross-checks against package_list,
which is an independent enumeration path.

Any count landing on a round number (10/20/100/1000/...) is flagged as a
TRUNCATION SUSPECT in the emitted diagnostics.
"""
import json
import sys

from lib import ckan, save, sleep

ROUND_SUSPECTS = {10, 20, 25, 50, 100, 200, 500, 1000, 2000, 3000, 5000}


def main():
    diags = []

    ok, res, d = ckan("package_search", q="", rows=0)
    diags.append({"step": "oracle", **d})
    if not ok:
        print("ORACLE FAILED", json.dumps(d, indent=2))
        sys.exit(1)
    oracle = res["count"]
    print("ORACLE package count =", oracle)

    # independent enumeration
    ok2, plist, d2 = ckan("package_list")
    diags.append({"step": "package_list", **d2})
    plist = plist or []
    print("package_list length =", len(plist))

    pkgs = {}
    start = 0
    ROWS = 50
    seen_pages = []
    while True:
        ok3, r3, d3 = ckan("package_search", q="", rows=ROWS, start=start,
                           sort="metadata_created asc")
        diags.append({"step": "walk", "start": start, **d3})
        if not ok3:
            print("WALK FAILED at start=%d: %s" % (start, d3.get("error")))
            break
        got = r3["results"]
        seen_pages.append({"start": start, "n": len(got),
                           "names": [g["name"] for g in got]})
        for g in got:
            pkgs[g["name"]] = g
        print("  start=%4d returned=%2d cumulative_unique=%d" % (start, len(got), len(pkgs)))
        if not got:
            break
        start += ROWS
        if start > oracle + ROWS * 2:
            break
        sleep(0.2)

    missing = sorted(set(plist) - set(pkgs))
    extra = sorted(set(pkgs) - set(plist))

    # If the sorted walk missed anything, fetch it directly by name (path shape
    # matters: package_show takes id=<name>).
    for name in list(missing):
        okp, rp, dp = ckan("package_show", id=name)
        diags.append({"step": "package_show_backfill", "name": name, **dp})
        if okp:
            pkgs[name] = rp
        sleep(0.1)

    nres = sum(len(p.get("resources", []) or []) for p in pkgs.values())

    summary = {
        "oracle_package_count": oracle,
        "package_list_length": len(plist),
        "walked_unique_packages": len(pkgs),
        "walk_missing_vs_package_list": missing,
        "walk_extra_vs_package_list": extra,
        "total_resources": nres,
        "truncation_suspects": {
            "oracle_is_round": oracle in ROUND_SUSPECTS,
            "resources_is_round": nres in ROUND_SUSPECTS,
        },
        "reconciled": len(pkgs) == oracle == len(plist),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    save("01_packages.json", list(pkgs.values()))
    save("01_harvest_summary.json", summary)
    save("01_diagnostics.json", diags)
    save("01_pages.json", seen_pages)


if __name__ == "__main__":
    main()
