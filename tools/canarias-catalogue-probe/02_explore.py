"""C0 step 2 - locate the SIPU / planeamiento packages inside the 174-package catalogue.

Prints the shape of a package record and ranks packages by resource count so the
planning corpus is FOUND rather than assumed. Also dumps every distinct field key
seen on packages and on resources - the catalogue's own metadata vocabulary is
what determines whether municipality / phase / vintage are EXPOSED or must be
parsed out of free text.
"""
import collections
import json
import re

from lib import load, save

pkgs = load("01_packages.json")

pkg_keys = collections.Counter()
res_keys = collections.Counter()
for p in pkgs:
    for k in p:
        pkg_keys[k] += 1
    for r in p.get("resources", []) or []:
        for k in r:
            res_keys[k] += 1

print("=== package field keys ===")
for k, v in pkg_keys.most_common():
    print("  %-32s %d" % (k, v))
print("=== resource field keys ===")
for k, v in res_keys.most_common():
    print("  %-32s %d" % (k, v))

print("\n=== packages by resource count (top 25) ===")
ranked = sorted(pkgs, key=lambda p: -len(p.get("resources", []) or []))
for p in ranked[:25]:
    print("  %5d  %-70s  org=%s" % (len(p.get("resources", []) or []),
                                    p["name"][:70],
                                    (p.get("organization") or {}).get("name")))

print("\n=== packages whose title/name/notes mention planning terms ===")
TERMS = re.compile(
    r"sipu|planeamiento|urbanistic|urbanismo|plan general|plan parcial|"
    r"plan especial|normas subsidiarias|ordenaci", re.I)
hits = []
for p in pkgs:
    blob = " ".join(str(p.get(k, "")) for k in ("name", "title", "notes"))
    if TERMS.search(blob):
        hits.append(p)
        print("  %-60s  res=%4d  title=%s" % (p["name"][:60],
                                              len(p.get("resources", []) or []),
                                              (p.get("title") or "")[:80]))
print("planning-term packages:", len(hits),
      "resources in them:", sum(len(p.get("resources", []) or []) for p in hits))

# full dump of one heavy package for shape inspection
if ranked:
    top = dict(ranked[0])
    top["resources"] = (top.get("resources") or [])[:3]
    save("02_sample_package.json", top)
    print("\n=== sample of heaviest package (3 resources) ===")
    print(json.dumps(top, ensure_ascii=False, indent=2)[:6000])

save("02_field_keys.json", {"package": pkg_keys, "resource": res_keys})
