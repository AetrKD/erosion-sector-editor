import test from 'node:test';
import assert from 'node:assert/strict';
import {createCamera,pickBox} from '../dist/iso.mjs';
const back={id:'back',min:[0,0,0],max:[1,1,1]},front={id:'front',min:[1.1,0,1.1],max:[2.1,1,2.1]};
const camera=azimuth=>createCamera({width:500,height:500,scale:100,target:[1,1,1],azimuth,elevation:30});
test('screen ray round trips the camera projection in every quadrant and at high elevation',()=>{
  for(const azimuth of [0,45,90,135,180,225,270,315])for(const elevation of [15,30,80]){
    const c=createCamera({width:800,height:500,scale:80,target:[-5,8,12],azimuth,elevation,offset:{x:45,y:-30}});
    const point=[-4,10,11],p=c.project(point),ray=c.ray(p.x,p.y);
    const depth=point.reduce((sum,v,i)=>sum+(v-ray.origin[i])*ray.direction[i],0);
    point.forEach((v,i)=>assert.ok(Math.abs(ray.origin[i]+depth*ray.direction[i]-v)<1e-8));
  }
});
test('overlapping projections select the visible surface independently of placement order',()=>{
  const c=camera(45),p=c.project([1.1,.6,1.1]);
  assert.equal(pickBox([back],c,p.x,p.y)?.id,'back');
  assert.equal(pickBox([front,back],c,p.x,p.y)?.id,'front');
  assert.equal(pickBox([back,front],c,p.x,p.y)?.id,'front');
  const reverse=camera(225),q=reverse.project([1,.6,1]);
  assert.equal(pickBox([front,back],reverse,q.x,q.y)?.id,'back');
});
test('picking stacked tiles and empty corners uses actual surfaces',()=>{
  const lower={id:'lower',min:[-2,-1,-2],max:[0,0,0]},upper={id:'upper',min:[-2,0,-2],max:[0,1,0]};
  for(const angle of [0,90,180,270]){
    const c=camera(angle),p=c.project([-1,1,-1]);
    assert.equal(pickBox([upper,lower],c,p.x,p.y)?.id,'upper');
    assert.equal(pickBox([lower,upper],c,p.x,p.y)?.id,'upper');
  }
  assert.equal(pickBox([upper,lower],camera(45),0,0),null);
});
