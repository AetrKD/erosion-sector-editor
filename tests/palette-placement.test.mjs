import test from 'node:test';
import assert from 'node:assert/strict';
import {palettePlacement} from '../dist/palette-placement.mjs';
import {createCamera,pointOnFloor} from '../dist/iso.mjs';
import {scanFixture} from '../tools/scan-fixture.mjs';
import {worldPoint} from '../dist/core.mjs';
import {encodeOccupancy} from '../dist/occupancy.mjs';

test('tile palette drops snap to block coordinates and reject real overlap even if a stored ID matches the preview',async()=>{
  const {project:p}=await scanFixture();p.placements[0].id='palette-preview';
  const valid=palettePlacement(p,{kind:'tile',id:'t0',rotation:90},{x:-.03,y:2,z:1.08},'r0');assert.equal(valid.error,'');assert.equal(valid.placement.x,-1/16);assert.equal(valid.placement.z,17/16);assert.equal(valid.placement.y,2);assert.equal(valid.placement.rotation,90);assert.equal(valid.placement.roomId,'r0');
  const blocked=palettePlacement(p,{kind:'tile',id:'t0'},{x:0,y:0,z:0},'r0');assert.match(blocked.error,/겹/);
});

test('gimmick drops remain inside each rotated edge cell and round-trip to the world cell center',async()=>{
  const {project:p}=await scanFixture();p.placements=p.placements.slice(0,1);const placement=p.placements[0];
  for(const rotation of [0,90,180,270]){placement.rotation=rotation;
    for(const [x,z] of [[0,0],[7,0],[0,7],[7,7]]){const item=palettePlacement(p,{kind:'gimmick',id:'keycard'},{x:x/16+.001,y:0,z:z/16+.001},'r0');assert.equal(item.error,'');assert.ok(item.position.x>=0&&item.position.x<8);assert.ok(item.position.z>=0&&item.position.z<8);assert.deepEqual(worldPoint(item.position,item.tile,item.placement),{x:x+.5,y:1,z:z+.5});}
  }
});

test('gimmicks require a tile on the selected floor and preserve local height in a multi-floor tile',async()=>{
  const {project:p}=await scanFixture();assert.match(palettePlacement(p,{kind:'gimmick',id:'scan'},{x:0,y:1,z:0}).error,/타일 내부/);
  p.placements=p.placements.slice(0,1);p.placements[0].y=-1;p.tiles[0].size.y=16;
  const item=palettePlacement(p,{kind:'gimmick',id:'scan'},{x:0,y:0,z:0});assert.equal(item.error,'');assert.equal(item.position.y,9);
  assert.match(palettePlacement(p,{kind:'gimmick',id:'scan'},{x:10,y:0,z:0}).error,/타일 내부/);
});

test('physical container drops reject occupied schematic blocks and existing containers but logical markers can overlap',async()=>{
  const {project:p}=await scanFixture();p.placements=p.placements.slice(0,1);p.placements[0].rotation=0;p.tiles[0].asset.occupancy=encodeOccupancy(p.tiles[0].size,[[2,1,2]]);
  const point={x:2/16,y:0,z:2/16};assert.match(palettePlacement(p,{kind:'gimmick',id:'supply'},point).error,/빈 블록/);assert.equal(palettePlacement(p,{kind:'gimmick',id:'scan'},point).error,'');
  assert.match(palettePlacement(p,{kind:'gimmick',id:'cargo'},{x:1/16,y:0,z:5/16}).error,/이미/);
});

test('isometric drop projection lands on the selected floor for every camera direction, pan and zoom',()=>{
  for(const azimuth of [0,45,90,180,225,315])for(const elevation of [15,30,80])for(const floor of [-2,0,3]){
    const camera=createCamera({width:800,height:600,scale:91,target:[2,1,3],azimuth,elevation,offset:{x:53,y:-21}}),point=[-1.25,floor,4.75],pixel=camera.project(point),back=pointOnFloor(camera,pixel.x,pixel.y,floor);
    assert.ok(Math.abs(back.x-point[0])<1e-8);assert.ok(Math.abs(back.z-point[2])<1e-8);assert.equal(back.y,floor);
  }
});

test('palette drops reject unknown types, removed terminals and nonfinite coordinates',async()=>{
  const {project:p}=await scanFixture();for(const brush of [{kind:'tile',id:'missing'},{kind:'gimmick',id:'missing'},{kind:'gimmick',id:'terminal'},{kind:'unknown',id:'scan'}])assert.ok(palettePlacement(p,brush,{x:0,y:0,z:0}).error);
  assert.ok(palettePlacement(p,{kind:'tile',id:'t0'},{x:NaN,y:0,z:0}).error);
});
