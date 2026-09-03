export const A=(o,...keys)=>{ if(!o) return undefined;
  for(const k of keys){ if(o[k]!==undefined && o[k]!==null && o[k]!=='Null' && o[k]!=='') return o[k]; }
  return undefined; };
export const LAY=(o)=>A(o,'LAY_CLASS','Class','LAY Class');
export const CLAUSE=(o)=>A(o,'LEGIS_REF_CLAUSE','Legislative Clause');
export const MBH=(o)=>A(o,'MAX_B_H','Maximum Building Height');
export const UNITS=(o)=>A(o,'UNITS','Units');
export const FSRV=(o)=>A(o,'FSR','Floor Space Ratio');
