# 04 — THE FALSIFICATIONS (executed in foreground, verbatim, 2026-09-01)

Two severances of `src/countryAdapters/se/seRuleMapper.ts`, the lane's provenance leg. Each was
executed, observed failing BY NAME, and restored BYTE-IDENTICALLY (sha256 compared).

```
SHA BEFORE (pristine): bf25cd7ce5e4bef2eece53dbb6c7497b3245fbe01fa9f057fcb37e0b6fda4d7d
```

## F1 — sever the rule's LEGAL ADDRESS (`source.document` -> null)

```
SHA SEVERED: c033d9a9eeb046dc1800f159f5e37bb97e9b208c20687dd7ce2b07a1220129f7
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  __tests__/seAdapter.test.ts > resolveSeProvisionChain — the live vocabulary leg, end to end > the rule's legal address is the release-pinned catalogue entry
AssertionError: expected null to be 'https://api.boverket.se/planbestammel…' // Object.is equality

- Expected:
"https://api.boverket.se/planbestammelsekatalogen/bestammelse/platt/7/ee5f8de3-89b0-479a-a5cb-7439d40623e8"

+ Received:
null

 ❯ __tests__/seAdapter.test.ts:476:30
    474|         expect(src.dataset).toBe(SE_RULE_DATASET);
    475|         expect(src.object_id).toBe(KOD);
    476|         expect(src.document).toBe(URL);
       |                              ^
    477|         // measured: Boverket serves lagstöd for 0 of the 908 in-force…
    478|         expect(src.article).toBeNull();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 45 passed | 3 skipped (49)
   Start at  19:09:35
   Duration  2.56s (transform 1.43s, setup 0ms, import 2.03s, tests 268ms, environment 0ms)

```

```
SHA RESTORED: bf25cd7ce5e4bef2eece53dbb6c7497b3245fbe01fa9f057fcb37e0b6fda4d7d  <-- byte-identical
```

## F2 — sever the R2 DENOMINATOR (`valueBasis.code` = provision.kod -> provision.kategori)

This is the severance that matters most: replacing the provision CODE with its CATEGORY
collapses the four Utnyttjandegrad denominators (egenskapsområdet / användningsområdet /
per fastighet / absolute) into ONE string — the exact C63 Aarhus failure, with every field
still parsing clean. THREE named tests went red, including the control-8 denominator test:

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  __tests__/seAdapter.test.ts > resolveSeProvisionChain — the live vocabulary leg, end to end > R2: the valueBasis carries the SERVED code verbatim — the denominator + measurement basis
AssertionError: expected { …(2) } to deeply equal { …(2) }

- Expected
+ Received

  {
-   "code": "DP_KM_Eg_Hojd_HogstaHojd_Nockhojd",
+   "code": "Höjd på byggnadsverk",
    "scheme": "se-boverket-bestammelsekod",
  }

 ❯ __tests__/seAdapter.test.ts:435:55
    433|             await resolveSeProvisionChain(KOD, { fetchImpl: keyedFetch…
    434|         );
    435|         expect(chain.rules[0]!.provenance.valueBasis).toEqual({
       |                                                       ^
    436|             scheme: SE_VALUE_BASIS_SCHEME,
    437|             code: KOD,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  __tests__/seAdapter.test.ts > control 8 — denominator + measurement basis survive normalization > keeps the FOUR Utnyttjandegrad denominators as four DISTINCT valueBasis codes
AssertionError: expected { …(2) } to deeply equal { …(2) }

- Expected
+ Received

  {
-   "code": "DP_KM_Eg_Utnytt_StorstaAreaProc_BruttoEgen",
+   "code": "Utnyttjandegrad",
    "scheme": "se-boverket-bestammelsekod",
  }

 ❯ __tests__/seAdapter.test.ts:552:24
    550|             expect(rule, `rule for ${kod}`).toBeDefined();
    551|             const vb = rule!.provenance.valueBasis;
    552|             expect(vb).toEqual({ scheme: SE_VALUE_BASIS_SCHEME, code: …
       |                        ^
    553|             seen.add(vb!.code);
    554|         }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  __tests__/seAdapter.test.ts > scramble control — the suite cannot pass on arbitrary input > a perturbation the mapper is NOT asked to refuse changes the OUTPUT visibly
AssertionError: expected 'Höjd på byggnadsverk' to be 'DP_KM_Eg_Hojd_HogstaHojd_Nockhojd' // Object.is equality

Expected: "DP_KM_Eg_Hojd_HogstaHojd_Nockhojd"
Received: "Höjd på byggnadsverk"

 ❯ __tests__/seAdapter.test.ts:775:50
    773|         const set = mapSeNumericProvisionCatalogue(FETCHED_AT);
    774|         const real = set.rules.find((r) => r.id === 'se-rule-DP_KM_Eg_…
    775|         expect(real.provenance.valueBasis!.code).toBe('DP_KM_Eg_Hojd_H…
       |                                                  ^
    776|         expect(real.provenance.valid_from).toBe('2020-10-01');
    777|

```

```
SHA RESTORED: bf25cd7ce5e4bef2eece53dbb6c7497b3245fbe01fa9f057fcb37e0b6fda4d7d  <-- byte-identical
$ npx vitest run __tests__/seAdapter.test.ts   ->  46 passed | 3 skipped (49), RC=0
```
