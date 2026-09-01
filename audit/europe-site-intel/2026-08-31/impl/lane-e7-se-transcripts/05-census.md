# 05 — THE INDEPENDENT CENSUS of Boverket release 7 (verbatim, 2026-09-01)

Computed by grep/count over the LIVE 13,176,663-byte `/release/full/platt/aktuell` body,
NOT derived from the adapter's imported table. This is the census the 83 imported rows and
the 83 tier-6 UNKNOWNs are counted against.

```
release id=7 namn=20251201 publicerad=2025-12-01T10:39:00 typ={'id': 1, 'namn': 'Juridisk', 'url': ''}
total bestammelser        : 3707
in force (slutargalla nul): 908
  of which numeric        : 83
  of which NON-numeric    : 825
in force by bestammelsetyp: {'Egenskapsbestämmelse': 678, 'Användningsbestämmelse': 230}
uttrycktvarde ALL releases: {None: 3436, 'Exakt': 59, 'Min': 76, 'Max': 90, '00': 10, '0,0': 29, '00-00': 2, 'MIn': 2, '0,0/0,0/…': 1, 'Mellan': 2}
uttrycktvarde in force    : {None: 824, 'Exakt': 22, 'Min': 34, 'Max': 28}
uttrycktvarde the 83      : {'Exakt': 20, 'Min': 34, 'Max': 28, None: 1}
the one with no sense     : ['DP_PO_Eg_Hojd_ExaktHojd_ExaktVan_Aldre']
lagstod on in-force rows  : 0 of 908
lagstod on ALL rows       : 750 of 3707
bestammelsekod unique(83) : True
id<->namn mismatches in bestammelsetyp  : 0 of 3707 rows
id<->namn mismatches in anvandningsform : 0 of 3707 rows
id<->namn mismatches in geometrityp     : 0 of 3707 rows
id<->namn mismatches in huvudmannaskap  : 0 of 3707 rows
id<->namn mismatches in lagstod         : 0 of 3707 rows

kategori of the 83: {'Höjd på byggnadsverk': 28, 'Fastighetsstorlek': 2, 'Utnyttjandegrad': 26, 'Markens anordnande och vegetation': 8, 'Placering': 1, 'Utformning av allmän plats': 10, 'Takvinkel': 6, 'Utförande': 1, 'Markreservat för allmännyttiga ändamål': 1}
numericSlots != 1 : ['DP_KM_Eg_MarkensAnordOchVeg_Markforhallanden_StorstaLutning', 'DP_KM_Eg_MarkensAnordOchVeg_Markforhallanden_MinstaLutning', 'DP_AP_Eg_UtformAP_Mark_StorstLutning', 'DP_AP_Eg_UtformAP_Mark_MinstLutning']
```
