# 01 — DISCOVERY: the Boverket Planbestämmelsekatalogen v2 API (verbatim, 2026-09-01)

Run from Git Bash on the lane machine. Every byte below is the service's.

```
=== 1. Boverket APIM portal catalogue (UNAUTHENTICATED) ===
$ curl -sS "https://api-portal.boverket.se/developer/apis?api-version=2022-04-01-preview" | jq -r ...
andamalskatalogen                  subscriptionRequired=True  path=andamalskatalogen
boverkets-api-f-r-begreppsbanken   subscriptionRequired=False path=begrepp
azu004-digitala-forfattningar      subscriptionRequired=False path=forfattningssamling
klimatdatabas                      subscriptionRequired=False path=klimatdatabas
klimatlast-v2                      subscriptionRequired=False path=klimatlast
boverkets-api-for-op-katalog       subscriptionRequired=False path=opmodell
planbestammelsekatalogenv2         subscriptionRequired=False path=planbestammelsekatalogen

=== 2. release/aktuell head (KEYLESS, HTTP 200) ===
$ curl -sS -o /dev/null -w '%{http_code} %{size_download}\n' "https://api.boverket.se/planbestammelsekatalogen/release/full/platt/aktuell"
200 13176663

=== 3. release metadata ===
$ curl -sS "https://api.boverket.se/planbestammelsekatalogen/release/7" | head -c 200
{"bestammelser":[{"id":"f4f88548-4108-433a-b378-00036b3df21a","url":"/planbestammelsekatalogen/bestammelse/7/f4f88548-4108-433a-b378-00036b3df21a"},{"id":"c5b0a486-179f-495f-833e-0006503d4df9","url":"curl: (23) Failure writing output to destination, passed 16384 returned 161


=== 4. error shapes (the failure!=absence discriminator) ===
$ curl /bestammelse/platt/aktuell/00000000-0000-0000-0000-000000000000 "Bestämmelse med id 00000000-0000-0000-0000-000000000000 saknas i aktuell publicerad release." [HTTP 404]
$ curl /bestammelse/platt/aktuell/not-a-uuid                    [HTTP 404]
$ curl /nosuchthing                                            { "statusCode": 404, "message": "Resource not found" } [HTTP 404]
$ curl /release/9999                                           "Efterfrågad release med id 9999 av katalogen saknas." [HTTP 404]
$ curl /vd/bestammelsetyp/999                                  "Bestämmelsetyp med id 999 saknas." [HTTP 404]
```
