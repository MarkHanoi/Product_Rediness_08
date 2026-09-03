LANE ME-GULF — resolver boundary-set additions (durable re-apply record)
========================================================================
The national-jurisdiction resolver (packages/site-parcel-data/src/jurisdiction/
nationalJurisdictionResolver.ts) claims a country only when the point is inside its
ne_10m polygon. This lane added FOUR Gulf countries to the boundary set so Dubai /
Abu Dhabi / Kuwait / Bahrain (all inside SAUDI_ARABIA_BBOX) CLAIM their own country
instead of being mislabelled / nearest-polygon-annexed to Saudi.

PROVENANCE (verified 2026-09-03 from this environment):
  source : https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/
           geojson/ne_10m_admin_0_countries.geojson  (13,287,234 bytes)
  sha256 : 239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255
           — BYTE-IDENTICAL to nationalBoundaries.json's pinned sourceSha256, so these
           four are provenance-consistent with the existing 16 (+ SI's SVN).
  pipeline: metric Douglas-Peucker @ 100 m + 5-decimal rounding + closed rings, all
           rings (exteriors + holes) flattened per country. VALIDATED byte-exact by
           re-deriving SAU with the same script: my SAU = 11 rings / 1887 verts /
           ring0=1560 / ring0[0]=[50.80787,24.74665] == the stored SAU exactly.

ADDED (countries key of nationalBoundaries.json):
  ARE -> regionCode "AE"   KWT -> regionCode "KW"
  BHR -> regionCode "BH"   OMN -> regionCode "OM"
  (QAT is deliberately NOT added — Qatar is the QA lane's keyless-cadastre jurisdiction.)

RE-APPLY (if concurrent shared-tree churn clobbers the 4 from the JSON):
  python - <<'PYEOF'
  import json
  p="packages/site-parcel-data/src/jurisdiction/data/nationalBoundaries.json"
  d=json.loads(open(p,encoding="utf-8").read())
  frag=json.loads(open("audit/intl-parcels/2026-09-02/resolver-additions-me-gulf/gulf-countries.json",encoding="utf-8").read())
  for k,v in frag.items(): d["countries"][k]=v
  open(p,"w",encoding="utf-8").write(json.dumps(d))  # json.dumps default separators == the file's serializer (idempotent, verified)
  PYEOF
  # then regenerate from scratch instead: `node extract.mjs <scratchdir-with-ne_10m.geojson>`

RESOLVER CODE EDITS (nationalJurisdictionResolver.ts):
  + import { isInUAE, isInKuwait, isInBahrain, isInOman } from '../countryAdapters/gulf/gulfJurisdiction.js';
  + CANDIDATE_PREFILTERS += ['ARE',isInUAE] ['KWT',isInKuwait] ['BHR',isInBahrain] ['OMN',isInOman]

TEST (nationalJurisdictionResolver.test.ts) — CONTROLS += one interior claim per country:
  ['Dubai',25.1972,55.2744,'ARE'] ['Kuwait City',29.3759,47.9774,'KWT']
  ['Manama',26.2285,50.586,'BHR'] ['Muscat',23.588,58.3829,'OMN']
