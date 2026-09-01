const B='https://tpdr.planuojustatau.lt/arcgis/rest/services/duomenu_viesinimas/ASGR/MapServer/0/query';
async function q(w){const body=new URLSearchParams({f:'json',where:w,returnCountOnly:'true'});const r=await fetch(B,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});return JSON.parse(await r.text());}
for(const [l,w] of [
 ['AUK_M = 0','MAX_AUK_M = 0'],['AUK_M < 0','MAX_AUK_M < 0'],
 ['TANKIS = 0','MAX_TANKIS = 0'],['APZELD = 0','MIN_APZELD = 0'],
 ['INTENS = 0','MAX_INTENS = 0'],['INTENS < 0','MAX_INTENS < 0'],
 ['AUK_M >0 valid','MAX_AUK_M > 0'],['TANKIS 1..100','MAX_TANKIS > 0 AND MAX_TANKIS <= 100'],
 ['APZELD 0..100','MIN_APZELD >= 0 AND MIN_APZELD <= 100'],
]){const r=await q(w);console.log(String(r.count).padStart(8),'|',l,r.error?JSON.stringify(r.error):'');}
