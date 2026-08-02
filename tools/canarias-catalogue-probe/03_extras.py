"""C0 step 3 - what metadata does the catalogue EXPOSE, versus what must be parsed?

This separates:
  * STRUCTURED metadata  - CKAN extras / tags / groups / format / size / dates
  * SEMI-STRUCTURED      - the resource URL path (island dir, municipality code)
  * FREE TEXT            - resource name + description

The distinction matters for the brief's question 6: whether APPROVAL PHASE is in
the catalogue metadata (structured) or only inferable from free text.
"""
import collections
import json
import re
import urllib.parse

from lib import load, save

pkgs = load("01_packages.json")
PLAN = [p for p in pkgs if p["name"].startswith("planeamiento-")]
URB = [p for p in pkgs if p["name"].startswith("planeamiento-urbanistico-de-")]
ENP = [p for p in pkgs if p["name"].startswith("planeamiento-de-espacios-naturales-")]

print("planeamiento-* packages       :", len(PLAN))
print("  planeamiento-urbanistico-de-:", len(URB))
print("  planeamiento-de-espacios-nat:", len(ENP))
print("  other planeamiento-*        :",
      [p["name"] for p in PLAN if p not in URB and p not in ENP])

print("\n=== package extras keys across planeamiento-urbanistico packages ===")
ex = collections.Counter()
exvals = collections.defaultdict(collections.Counter)
for p in URB:
    for e in p.get("extras", []) or []:
        ex[e["key"]] += 1
        exvals[e["key"]][str(e["value"])[:120]] += 1
for k, v in ex.most_common():
    print("  %-28s present_on=%d distinct_values=%d" % (k, v, len(exvals[k])))
    for val, c in exvals[k].most_common(6):
        print("        %4d  %s" % (c, val))

print("\n=== tags across planeamiento-urbanistico packages ===")
tg = collections.Counter()
for p in URB:
    for t in p.get("tags", []) or []:
        tg[t.get("name")] += 1
for k, v in tg.most_common(40):
    print("  %-40s %d" % (k, v))

print("\n=== resource FORMAT distribution across planeamiento-urbanistico ===")
fmt = collections.Counter()
for p in URB:
    for r in p.get("resources", []) or []:
        fmt[r.get("format") or "(empty)"] += 1
tot = sum(fmt.values())
for k, v in fmt.most_common():
    print("  %-14s %5d  %5.1f%%" % (k, v, 100.0 * v / tot))
print("  TOTAL resources in planeamiento-urbanistico packages:", tot)

print("\n=== resource-level structured fields: are they POPULATED? ===")
fields = ["size", "mimetype", "hash", "resource_type", "last_modified",
          "created", "url_type", "description", "name"]
pop = collections.Counter()
n = 0
for p in URB:
    for r in p.get("resources", []) or []:
        n += 1
        for f in fields:
            v = r.get(f)
            if v not in (None, "", [], {}):
                pop[f] += 1
for f in fields:
    print("  %-16s populated %5d / %5d = %5.1f%%" % (f, pop[f], n, 100.0 * pop[f] / n))

print("\n=== URL host / path-shape distribution (semi-structured metadata) ===")
hosts = collections.Counter()
pathpat = collections.Counter()
for p in URB:
    for r in p.get("resources", []) or []:
        u = urllib.parse.urlparse(r.get("url") or "")
        hosts[u.netloc] += 1
        seg = [s for s in u.path.split("/") if s]
        shape = "/".join(seg[:3])
        pathpat[shape] += 1
for k, v in hosts.most_common():
    print("  host %-32s %d" % (k, v))
print()
for k, v in pathpat.most_common(15):
    print("  path %-52s %d" % (k, v))

print("\n=== do FIP urls carry a municipality code? (sample 12) ===")
seen = 0
for p in URB:
    for r in p.get("resources", []) or []:
        u = r.get("url") or ""
        m = re.search(r"/fip/(\d+)_", u)
        if m and seen < 12:
            print("  %-46s code=%s" % (p["name"][:46], m.group(1)))
            seen += 1
            break

print("\n=== approval-phase / date vocabulary in FREE TEXT (description) ===")
PHASE = re.compile(r"aprobaci[oó]n\s+(\w+)", re.I)
ph = collections.Counter()
dated = 0
ndesc = 0
DATE = re.compile(r"aprobad[ao]\s+el\s+(\d{2}/\d{2}/\d{4})", re.I)
for p in URB:
    for r in p.get("resources", []) or []:
        d = r.get("description") or ""
        if d:
            ndesc += 1
        for m in PHASE.finditer(d):
            ph[m.group(1).lower()] += 1
        if DATE.search(d):
            dated += 1
for k, v in ph.most_common(20):
    print("  aprobacion-%-16s %d" % (k, v))
print("  resources with an 'aprobada el DD/MM/YYYY' date: %d / %d = %.1f%%"
      % (dated, ndesc, 100.0 * dated / max(ndesc, 1)))

save("03_formats.json", fmt)
save("03_extras_keys.json", {k: dict(exvals[k]) for k in ex})
