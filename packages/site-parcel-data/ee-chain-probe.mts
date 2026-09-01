// E1d LIVE PROBE HARNESS (temporary, deleted after the run — lives in the package dir only
// for module resolution; NOT part of the adapter). Updated for the E1d rework chain shape
// (minted Plan/Prescription referents + plots leg + R3 validityBasis).
import { resolveEeParcelChain } from './src/countryAdapters/ee/index.js';

const tunnus = process.argv[2]!;
const chain = await resolveEeParcelChain(tunnus);
if (chain.status !== 'found') {
    console.log('CHAIN OUTCOME:', JSON.stringify(chain));
    process.exit(0);
}
const v = chain.value;
console.log('PARCEL:', v.parcel.tunnus, '|', v.parcel.address, '|', v.parcel.municipality,
    '| use:', JSON.stringify(v.parcel.landUse), '| area', v.parcel.areaM2, 'm2 | crs', v.parcel.crs,
    '| ring pts', v.parcel.ring.length);
console.log('BUILDINGS:', v.buildings.status,
    v.buildings.status === 'found'
        ? v.buildings.value.map(b => `etak ${b.etakId}/ehr ${b.ehrGid} floors ${b.maxFloors} hSurv ${b.heightSurveyedM} hReg ${b.heightRegisterM} state ${b.state}`).join(' ; ')
        : (v.buildings as { reason?: string }).reason);

const printRules = (rules: readonly import('@pryzm/schemas').SiteIntelRule[]): void => {
    for (const r of rules) {
        const p = r.provenance;
        console.log(`  RULE ${p.parameter} = ${JSON.stringify(p.value)}${p.unit ? ' ' + p.unit : ''}`
            + ` | tier ${p.confidence.tier} ${p.derivation} ${p.valueLocation}`
            + ` | ${p.validityBasis} from ${p.valid_from}`
            + ` | basis ${JSON.stringify(r.applicability.basis)}`
            + (r.applicability.useScope.length > 0 ? ` | useScope ${JSON.stringify(r.applicability.useScope)}` : '')
            + (r.applicability.geometry !== null ? ' | inline-geometry' : ''));
    }
};

if (v.buildingAreas.status !== 'found') {
    console.log('BUILDING-AREAS:', v.buildingAreas.status, (v.buildingAreas as { reason?: string }).reason);
} else {
    for (const area of v.buildingAreas.value) {
        console.log(`BUILDING-AREA objectid ${area.hoonestus.objectid} sysid ${area.hoonestus.sysid}`
            + ` | plan ${area.plan ? `${area.plan.kovid} "${area.plan.status}" adopted ${area.plan.adopted}` : 'NULL'}`
            + ` | MINTED plan ${area.planEntity ? area.planEntity.id : 'NULL'}`
            + ` | MINTED prescription ${area.prescription ? `${area.prescription.id} kind=${area.prescription.kind} → ${area.prescription.zoneOrPlanRef}` : 'NULL'}`
            + ` | ${area.rules.length} rules`);
        printRules(area.rules);
        // REFERENT CONTRACT CHECK (live): every basis ref resolves to a carried minted id.
        const minted = new Set([area.prescription?.id, area.planEntity?.id].filter((x): x is string => !!x));
        const dangling = area.rules.flatMap(r => r.applicability.basis).filter(b => !minted.has(b.ref));
        console.log(`  REFERENTS: minted ${JSON.stringify([...minted])} | dangling refs: ${dangling.length}`);
    }
}
if (v.plots.status !== 'found') {
    console.log('PLOTS:', v.plots.status, (v.plots as { reason?: string }).reason);
} else {
    for (const plot of v.plots.value) {
        console.log(`PLOT objectid ${plot.krunt.objectid} sysid ${plot.krunt.sysid} otstarve "${plot.krunt.otstarve}"`
            + ` | MINTED plan ${plot.planEntity ? plot.planEntity.id : 'NULL'}`
            + ` | MINTED prescription ${plot.prescription ? `${plot.prescription.id} kind=${plot.prescription.kind}` : 'NULL'}`
            + ` | ${plot.rules.length} rules`);
        printRules(plot.rules);
        const minted = new Set([plot.prescription?.id, plot.planEntity?.id].filter((x): x is string => !!x));
        const dangling = plot.rules.flatMap(r => r.applicability.basis).filter(b => !minted.has(b.ref));
        console.log(`  REFERENTS: minted ${JSON.stringify([...minted])} | dangling refs: ${dangling.length}`);
    }
}
