import { resolveParameter } from './packages/family-runtime/src/index.ts';
const P = (id, name, dataType, defaultValue, expression=null) =>
  ({ id, name, kind:'instance', dataType, defaultValue, expression, ifcMapping:null, exposed:true });
const input = {
  parameters: [
    P('par_W','Width','length', null, 'FrameWidth + Tilt'),
    P('par_G','GlassWidth','length', null, 'Width - 2*FrameWidth'),
    P('par_T','Tilt','angle', 0.2),
    P('par_F','FrameWidth','length', 75),
  ],
  type: { id:'t', name:'T', values: { par_W: 1200 } },
  instanceOverrides: {},
};
const r = resolveParameter(input);
console.log(JSON.stringify(r, null, 1));
