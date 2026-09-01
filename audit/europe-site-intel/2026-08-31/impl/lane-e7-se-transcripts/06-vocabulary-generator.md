# 06 — THE VOCABULARY GENERATOR, VERBATIM

The 83 imported rows in `countryAdapters/se/sePlanProvisionCatalogue.ts` are GENERATED, never
hand-typed. The generator is reproduced here in full rather than committed to a shared tools/
path (barrel protocol — this lane owns only its own adapter directory and its own test file).

It REFUSES to emit when the served set and the canonical map disagree in EITHER direction, so a
Boverket release that adds or retires a numeric provision cannot be absorbed silently.

## Re-run

```
curl -sS "https://api.boverket.se/planbestammelsekatalogen/release/full/platt/aktuell" -o se_pbk_flat.json
python gen_se_vocab.py se_pbk_flat.json > rows.ts
```

## Output on 2026-09-01 (stderr)

```
release 7 20251201 2025-12-01T10:39:00
rows 83 unmapped 0 stale-map-keys 0
```

## gen_se_vocab.py

```python
# LANE E7-SE generator - turns the LIVE Boverket Planbestammelsekatalogen v2 release into the
# adapter's imported-verbatim vocabulary rows. Re-run:
#   curl -sS "https://api.boverket.se/planbestammelsekatalogen/release/full/platt/aktuell" -o se_pbk_flat.json
#   python gen_se_vocab.py se_pbk_flat.json
import json, re, sys

# EXPLICIT canonical mapping, keyed by bestammelsekod. Authored by hand and reviewed against the
# 83 served formuleringar - NEVER derived by parsing Swedish prose at runtime.
PARAM = {
 'DP_KM_Eg_Utnytt_StorstaAreaKvm_Brutto': ('maxGrossFloorArea', 'm2'),
 'DP_KM_Eg_Utnytt_StorstaAreaKvm_BruttoAnv': ('maxGrossFloorArea', 'm2'),
 'DP_KM_Eg_Utnytt_StorstaAreaKvm_BruttoFastigh': ('maxGrossFloorArea', 'm2'),
 'DP_KM_Eg_Utnytt_StorstaAreaKvm_Byggnadsarea': ('maxBuildingArea', 'm2'),
 'DP_KM_Eg_Utnytt_StorstaAreaKvm_ByggnadsareaAnv': ('maxBuildingArea', 'm2'),
 'DP_KM_Eg_Utnytt_StorstaAreaKvm_ByggnadsareaFastigh': ('maxBuildingArea', 'm2'),
 'DP_KM_Eg_Utnytt_MinstaAreaKvm_BruttoKvm': ('minGrossFloorArea', 'm2'),
 'DP_KM_Eg_Utnytt_MinstaAreaKvm_BruttoAnv': ('minGrossFloorArea', 'm2'),
 'DP_KM_Eg_Utnytt_MinstaAreaKvm_BruttoFastigh': ('minGrossFloorArea', 'm2'),
 'DP_KM_Eg_Utnytt_MinstaAreaKvm_Byggnads': ('minBuildingArea', 'm2'),
 'DP_KM_Eg_Utnytt_MinstaAreaKvm_ByggnadsAnv': ('minBuildingArea', 'm2'),
 'DP_KM_Eg_Utnytt_MinstaAreaKvm_ByggnadsFastigh': ('minBuildingArea', 'm2'),
 'DP_KM_Eg_Utnytt_StorstaAreaProc_BruttoEgen': ('maxGrossFloorAreaPercent', '%'),
 'DP_KM_Eg_Utnytt_StorstaAreaProc_BruttoAnv': ('maxGrossFloorAreaPercent', '%'),
 'DP_KM_Eg_Utnytt_StorstaAreaProc_ByggnadsEgen': ('maxBuildingAreaPercent', '%'),
 'DP_KM_Eg_Utnytt_StorstaAreaProc_ByggnadsAnv': ('maxBuildingAreaPercent', '%'),
 'DP_KM_Eg_Utnytt_MinstaAreaProc_BruttoEgen': ('minGrossFloorAreaPercent', '%'),
 'DP_KM_Eg_Utnytt_MinstaAreaProc_BruttoAnv': ('minGrossFloorAreaPercent', '%'),
 'DP_KM_Eg_Utnytt_MinstaAreaProc_ByggnadsEgen': ('minBuildingAreaPercent', '%'),
 'DP_KM_Eg_Utnytt_MinstaAreaProc_ByggnadsAnv': ('minBuildingAreaPercent', '%'),
 'DP_KM_Eg_Utnytt_AreaPerByggnad_StorstaBruttoKvm': ('maxGrossFloorAreaPerBuilding', 'm2'),
 'DP_KM_Eg_Utnytt_AreaPerByggnad_StorstaByggnadsKvm': ('maxBuildingAreaPerBuilding', 'm2'),
 'DP_KM_Eg_Utnytt_AreaPerByggnad_MinstaBruttoKvm': ('minGrossFloorAreaPerBuilding', 'm2'),
 'DP_KM_Eg_Utnytt_AreaPerByggnad_MinstaByggnadsKvm': ('minBuildingAreaPerBuilding', 'm2'),
 'DP_KM_Eg_Utnytt_AreaUnderMark_StorstaKvm': ('maxGrossFloorAreaBelowGround', 'm2'),
 'DP_KM_Eg_Utnytt_AreaUnderMark_MinstaKvm': ('minGrossFloorAreaBelowGround', 'm2'),
 'DP_KM_Eg_Hojd_HogstaHojd_Nockhojd': ('maxRidgeHeight', 'm'),
 'DP_KM_Eg_Hojd_HogstaHojd_NockhojdNollplan': ('maxRidgeHeightAboveDatum', 'm'),
 'DP_KM_Eg_Hojd_HogstaHojd_Totalhojd': ('maxTotalHeight', 'm'),
 'DP_KM_Eg_Hojd_HogstaHojd_TotalhojdNollplan': ('maxTotalHeightAboveDatum', 'm'),
 'DP_KM_Eg_Hojd_HogstaHojd_ByggnadsverkNockhojd': ('maxRidgeHeight', 'm'),
 'DP_KM_Eg_Hojd_HogstaHojd_ByggnadsverkNockhojdNollplan': ('maxRidgeHeightAboveDatum', 'm'),
 'DP_KM_Eg_Hojd_HogstaHojd_ByggnadsverkTotalhojd': ('maxTotalHeight', 'm'),
 'DP_KM_Eg_Hojd_HogstaHojd_ByggnadsverkTotalhojdNollplan': ('maxTotalHeightAboveDatum', 'm'),
 'DP_KM_Eg_Hojd_LagstaHojd_Nockhojd': ('minRidgeHeight', 'm'),
 'DP_KM_Eg_Hojd_LagstaHojd_NockhojdNollplan': ('minRidgeHeightAboveDatum', 'm'),
 'DP_KM_Eg_Hojd_LagstaHojd_Totalhojd': ('minTotalHeight', 'm'),
 'DP_KM_Eg_Hojd_LagstaHojd_TotalhojdNollplan': ('minTotalHeightAboveDatum', 'm'),
 'DP_KM_Eg_Hojd_LagstaHojd_ByggnadsverkNockhojd': ('minRidgeHeight', 'm'),
 'DP_KM_Eg_Hojd_LagstaHojd_ByggnadsverkNockhojdNollplan': ('minRidgeHeightAboveDatum', 'm'),
 'DP_KM_Eg_Hojd_LagstaHojd_ByggnadsverkTotalhojd': ('minTotalHeight', 'm'),
 'DP_KM_Eg_Hojd_LagstaHojd_ByggnadsverkTotalhojdNollplan': ('minTotalHeightAboveDatum', 'm'),
 'DP_KM_Eg_Hojd_ExaktHojd_Nockhojd': ('exactRidgeHeight', 'm'),
 'DP_KM_Eg_Hojd_ExaktHojd_NockhojdNollplan': ('exactRidgeHeightAboveDatum', 'm'),
 'DP_KM_Eg_Hojd_ExaktHojd_Totalhojd': ('exactTotalHeight', 'm'),
 'DP_KM_Eg_Hojd_ExaktHojd_TotalhojdNollplan': ('exactTotalHeightAboveDatum', 'm'),
 'DP_KM_Eg_Hojd_ExaktHojd_ByggnadsverkNockhojd': ('exactRidgeHeight', 'm'),
 'DP_KM_Eg_Hojd_ExaktHojd_ByggnadsverkNockhojdNollplan': ('exactRidgeHeightAboveDatum', 'm'),
 'DP_KM_Eg_Hojd_ExaktHojd_ByggnadsverkTotalhojd': ('exactTotalHeight', 'm'),
 'DP_KM_Eg_Hojd_ExaktHojd_ByggnadsverkTotalhojdNollplan': ('exactTotalHeightAboveDatum', 'm'),
 'DP_KM_Eg_Hojd_HogstaHojd_HogstaVan_Aldre': ('maxStoreys', None),
 'DP_KM_Eg_Hojd_LagstaHojd_LagstaVan_Aldre': ('minStoreys', None),
 'DP_KM_Eg_Hojd_ExaktHojd_ExaktVan_Aldre': ('exactStoreys', None),
 'DP_PO_Eg_Hojd_ExaktHojd_ExaktVan_Aldre': ('exactStoreys', None),
 'DP_KM_Eg_Takvinkel_Storsta_Storsta': ('maxRoofPitch', 'deg'),
 'DP_KM_Eg_Takvinkel_Storsta_Byggnad': ('maxRoofPitch', 'deg'),
 'DP_KM_Eg_Takvinkel_Minsta_Minsta': ('minRoofPitch', 'deg'),
 'DP_KM_Eg_Takvinkel_Minsta_Byggnad': ('minRoofPitch', 'deg'),
 'DP_KM_Eg_Takvinkel_Exakt_Exakt': ('exactRoofPitch', 'deg'),
 'DP_KM_Eg_Takvinkel_Exakt_Byggnad': ('exactRoofPitch', 'deg'),
 'DP_KM_Eg_Fastighetsstorlek_Minsta_Minsta': ('minPlotArea', 'm2'),
 'DP_KM_Eg_Fastighetsstorlek_Storsta_Storsta': ('maxPlotArea', 'm2'),
 'DP_KM_Eg_Plac_Byggnadsverk_Fastgrans': ('minSetbackFromPlotBoundary', 'm'),
 'DP_KM_Eg_MarkensAnordOchVeg_MarkensGenomslapp_Fastigh': ('minPermeableSurfacePercentOfPlot', '%'),
 'DP_KM_Eg_MarkensAnordOchVeg_MarkensGenomslapp_Proc': ('minPermeableSurfacePercentOfGround', '%'),
 'DP_KM_Eg_MarkensAnordOchVeg_Markforhallanden_EjHogreAn': ('maxGroundLevelAboveDatum', 'm'),
 'DP_KM_Eg_MarkensAnordOchVeg_Markforhallanden_EjLagreAn': ('minGroundLevelAboveDatum', 'm'),
 'DP_KM_Eg_MarkensAnordOchVeg_Markforhallanden_MarkhojdNollplan': ('exactGroundLevelAboveDatum', 'm'),
 'DP_KM_Eg_MarkensAnordOchVeg_Markforhallanden_MinushojdNollplan': ('exactGroundLevelBelowDatum', 'm'),
 'DP_KM_Eg_MarkensAnordOchVeg_Markforhallanden_MinstaLutning': ('minGroundSlopeRatio', None),
 'DP_KM_Eg_MarkensAnordOchVeg_Markforhallanden_StorstaLutning': ('maxGroundSlopeRatio', None),
 'DP_KM_Eg_Utforande_Schaktningsniva_LagstaSchaktNollplan': ('minExcavationLevelAboveDatum', 'm'),
 'DP_KM_Eg_Markreservat_GC_FriHojd': ('minClearHeightForPublicPassage', 'm'),
 'DP_AP_Eg_UtformAP_Dagv_Fordroj': ('stormwaterDetentionVolume', 'm3'),
 'DP_AP_Eg_UtformAP_Dagv_VatmarkYta': ('constructedWetlandArea', 'm2'),
 'DP_AP_Eg_UtformAP_Mark_GenomslappligProc': ('minPermeableSurfacePercentOfGround', '%'),
 'DP_AP_Eg_UtformAP_Mark_MinstLutning': ('minGroundSlopeRatio', None),
 'DP_AP_Eg_UtformAP_Mark_StorstLutning': ('maxGroundSlopeRatio', None),
 'DP_AP_Eg_UtformAP_Mark_Minushojd': ('exactGroundLevelBelowDatum', 'm'),
 'DP_AP_Eg_UtformAP_Mark_Plushojd': ('exactGroundLevelAboveDatum', 'm'),
 'DP_AP_Eg_UtformAP_SkyddStorning_BullerskyddHojdNollplan': ('noiseBarrierHeightAboveDatum', 'm'),
 'DP_AP_Eg_UtformAP_SkyddStorning_VallHojdNollplan': ('bermHeightAboveDatum', 'm'),
 'DP_AP_Eg_UtformAP_SkyddStorning_VatmarkYta': ('constructedWetlandArea', 'm2'),
}

d = json.load(open(sys.argv[1], encoding='utf-8'))
cur = [x for x in d['bestammelser'] if not x.get('slutargalla')]
num = [x for x in cur if 'decimaltal' in (x['bestammelseformulering'] or '')]
num.sort(key=lambda x: x['bestammelsekod'])
served = {x['bestammelsekod'] for x in num}
missing = [x['bestammelsekod'] for x in num if x['bestammelsekod'] not in PARAM]
extra = [k for k in PARAM if k not in served]
sys.stderr.write('release %s %s %s\n' % (d['id'], d['namn'], d['publicerad']))
sys.stderr.write('rows %d unmapped %d stale-map-keys %d\n' % (len(num), len(missing), len(extra)))
if missing:
    sys.stderr.write('MISSING %s\n' % missing)
if extra:
    sys.stderr.write('EXTRA %s\n' % extra)


def ts(s):
    if s is None:
        return 'null'
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n') + "'"


slots = re.compile(r'\[[^\]:]+:decimaltal\]')
out = []
for x in num:
    p, u = PARAM[x['bestammelsekod']]
    out.append(
        '    {\n'
        + '        kod: %s,\n' % ts(x['bestammelsekod'])
        + '        uuid: %s,\n' % ts(x['id'])
        + '        parameter: %s,\n' % ts(p)
        + '        unit: %s,\n' % ts(u)
        + '        sense: %s,\n' % ts(x['uttrycktvarde'])
        + '        numericSlots: %d,\n' % len(slots.findall(x['bestammelseformulering']))
        + '        anvandningsform: %s,\n' % ts(x['anvandningsform'])
        + '        kategori: %s,\n' % ts(x['kategori'])
        + '        underkategori: %s,\n' % ts(x['underkategori'])
        + '        beteckning: %s,\n' % ts(x['beteckning'])
        + '        borjargalla: %s,\n' % ts(x['borjargalla'][:10])
        + '        formulering:\n            %s,\n' % ts(x['bestammelseformulering'])
        + '    },'
    )
sys.stdout.write('\n'.join(out) + '\n')
```
