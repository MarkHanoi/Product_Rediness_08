# 03 — TEST RUNS (foreground, verbatim, 2026-09-01)

## A. the SE suite, OFFLINE (hermetic — the default)
```
$ cd packages/site-parcel-data && npx vitest run __tests__/seAdapter.test.ts

 RUN  v4.1.10 C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/packages/site-parcel-data


 Test Files  1 passed (1)
      Tests  46 passed | 3 skipped (49)
   Start at  19:10:16
   Duration  2.66s (transform 1.53s, setup 0ms, import 2.18s, tests 239ms, environment 0ms)

```

## B. the SE suite, LIVE against api.boverket.se (opt-in, `SE_LIVE=1`)

The second live test resolves **all 83 imported provisions end-to-end** against the live
national catalogue — 83 real HTTP round-trips, each producing a schema-valid `SiteIntelRule`.
```
$ SE_LIVE=1 npx vitest run __tests__/seAdapter.test.ts

 RUN  v4.1.10 C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/packages/site-parcel-data


 Test Files  1 passed (1)
      Tests  49 passed (49)
   Start at  19:09:13
   Duration  8.71s (transform 1.55s, setup 0ms, import 2.21s, tests 6.29s, environment 0ms)

```

## C. the WHOLE package suite — nothing broken for the sibling lanes
```
$ npx vitest run

 RUN  v4.1.10 C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/packages/site-parcel-data


 Test Files  165 passed (165)
      Tests  3482 passed | 3 skipped (3485)
   Start at  19:11:23
   Duration  47.72s (transform 33.87s, setup 0ms, import 220.02s, tests 12.99s, environment 68ms)

```

## D. package typecheck
```
$ npx tsc -p tsconfig.json --noEmit ; echo RC=$?
RC=0
```

## E. ROOT tsc (the stricter one the Fly build uses)
```
$ NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json > /tmp/se_roottsc.txt 2>&1; echo "RC=$?"
RC=0
$ cat /tmp/se_roottsc.txt
npm warn Unknown project config "package-manager-strict". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
```

## F. FINAL RE-EXECUTION at 19:18–19:20, AFTER every edit and AFTER the sibling
##    lanes E7-FI / E7-LU / E7-NO landed their directories in this same package

Re-executed rather than carried forward, per the mtime rule: a green transcript written
before its subject's last edit proves nothing. Note the package totals MOVED between the
19:11 run (165 files / 3,482 tests) and the 19:20 run — a sibling lane added a suite.

```
$ npx vitest run __tests__/seAdapter.test.ts               -> RC=0
 Test Files  1 passed (1)
      Tests  46 passed | 3 skipped (49)
$ npx tsc -p tsconfig.json --noEmit                        -> RC=0  (no output)
$ NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json  -> RC=0  (no output)
$ npx eslint packages/site-parcel-data/src/countryAdapters/se \
            packages/site-parcel-data/__tests__/seAdapter.test.ts          -> RC=0  (no output)
$ npx vitest run                          (whole package)  -> RC=0
 Test Files  166 passed (166)
      Tests  3524 passed | 3 skipped (3527)
```

```
$ git status --porcelain | grep "^ M"
 M packages/command-registry/tsconfig.tsbuildinfo     <- pre-existing at session start, not this lane
$ git status --porcelain | grep "^??" | grep -i se
?? audit/europe-site-intel/2026-08-31/impl/barrel-additions-se.txt
?? audit/europe-site-intel/2026-08-31/impl/lane-e7-se-transcripts/
?? audit/europe-site-intel/2026-08-31/impl/lane-e7-se.md
?? packages/site-parcel-data/__tests__/fixtures/se-boverket-pbk-2026-09-01/
?? packages/site-parcel-data/__tests__/fixtures/se-lantmateriet-ngp-2026-09-01/
?? packages/site-parcel-data/__tests__/seAdapter.test.ts
?? packages/site-parcel-data/src/countryAdapters/se/
```

NO shared file was modified by this lane. NOT COMMITTED (hard rule).
