# 02 — THE LANTMÄTERIET CREDENTIAL GATE, MEASURED (verbatim, 2026-09-01)

```
=== A. THE GATE: three Lantmateriet doors, one 401 ===
$ curl -sS "https://api.lantmateriet.se/distribution/geodatakatalog/sokning/v1/detaljplan/v1/search"
{"code":"900902","message":"Missing Credentials","description":"Invalid Credentials. Make sure your API invocation call has a header: 'Authorization : Bearer ACCESS_TOKEN' or 'Authorization : Basic ACCESS_TOKEN' or 'ApiKey : API_KEY'"}  [HTTP 401]

$ curl -sS "https://api.lantmateriet.se/distribution/geodatakatalog/visning/v1/detaljplan/v1/wms?request=GetCapabilities&version=1.1.1&service=WMS"
{"code":"900902","message":"Missing Credentials","description":"Invalid Credentials. Make sure your API invocation call has a header: 'Authorization : Bearer ACCESS_TOKEN' or 'Authorization : Basic ACCESS_TOKEN' or 'ApiKey : API_KEY'"}  [HTTP 401]

$ curl -sS "https://api.lantmateriet.se/distribution/geodatakatalog/sokning/v1/fastighetsindelning/v1/search"
{"code":"900902","message":"Missing Credentials","description":"Invalid Credentials. Make sure your API invocation call has a header: 'Authorization : Bearer ACCESS_TOKEN' or 'Authorization : Basic ACCESS_TOKEN' or 'ApiKey : API_KEY'"}  [HTTP 401]

=== B. the API portal (login wall) ===
apimanager.lantmateriet.se -> HTTP 302

=== C. NOT A GATE — opendata.lantmateriet.se is AAAA-only (an IPv4 egress limitation of OURS) ===
opendata.lantmateriet.se         ['IPv6']  2001:67c:268c:f110::2063
api.lantmateriet.se              ['IPv4']  192.71.191.155
api.boverket.se                  ['IPv4']  13.93.64.122
curl: (6) Could not resolve host: opendata.lantmateriet.se
curl -4 opendata.lantmateriet.se -> HTTP 000
```

## sha256 of the recorded 401 bodies (committed as fixtures)

```
9aed6cff90dc8048401d3b4e88f36394e6a8ee1c3391211ba0b9daff3e1a42e9 *se-lantmateriet-ngp-2026-09-01/ngp-detaljplan-search-401.json
9aed6cff90dc8048401d3b4e88f36394e6a8ee1c3391211ba0b9daff3e1a42e9 *se-lantmateriet-ngp-2026-09-01/ngp-detaljplan-wms-401.json
9aed6cff90dc8048401d3b4e88f36394e6a8ee1c3391211ba0b9daff3e1a42e9 *se-lantmateriet-ngp-2026-09-01/ngp-fastighetsindelning-search-401.json
6f12ab73708b1cc338bc42d80acf5af3d3f6240167b81336edf8ac5435592b44 *se-boverket-pbk-2026-09-01/bestammelse-hogsta-nockhojd.json
b6544e675aa599437c763658d65c0bfe68a233c805108923a4a9e8bb152735e3 *se-boverket-pbk-2026-09-01/bestammelse-hogsta-totalhojd-nollplan.json
0c314b357d446f3017061a33a1cc5a83c8a034a86ce6e3d33f8c549e4465ddad *se-boverket-pbk-2026-09-01/bestammelse-markens-genomslapplighet-fastighet.json
4d76751c365a16283a588d7d3d804ae027dec9587a8ad9061eb943a87a681633 *se-boverket-pbk-2026-09-01/bestammelse-placering-fastighetsgrans.json
7741b4bc430be35eb6aa298c1c5990eb35a2112d9223d3e6bb63bb6c52df94da *se-boverket-pbk-2026-09-01/bestammelse-storsta-bruttoarea-proc-egen.json
6dd8d7442044be431e860786a0bfcbf13f147bcf3b397d7703aedaff86d1dae8 *se-boverket-pbk-2026-09-01/bestammelse-storsta-byggnadsarea-kvm.json
fe20c8b7d3400873fcbceae6b4f12b3122a1abe20fe53cc2400f8c8807d6dac6 *se-boverket-pbk-2026-09-01/bestammelse-storsta-byggnadsarea-proc-anv.json
bcb84ab97df0cba012aea220ccc97ec3466fe885de5384fc37c04f4a9ceb2e06 *se-boverket-pbk-2026-09-01/bestammelse-storsta-takvinkel.json
a9558149b197a6854b6601beaae9768a078883d13d7b80c4d259b6df7fc9aef9 *se-boverket-pbk-2026-09-01/vd-anvandningsform.json
af9910c885c1c164989164cab26979662eef6be848765027336cde9ff245315e *se-boverket-pbk-2026-09-01/vd-bestammelsetyp.json
4931f8c2ceb3cd6d4d60729e93577a6698b087d92a3f36926d696cc40ae4ef86 *se-boverket-pbk-2026-09-01/vd-geometrityp.json
570c0657421855e00a321314428da5f433809640a25aea9be4118f24d46b422a *se-boverket-pbk-2026-09-01/vd-huvudmannaskap.json
93028b5fa584ce36cd58d28cb3d77b9f1748118af05c501f50b814be86e5e9f9 *se-boverket-pbk-2026-09-01/vd-lagstod.json
```
