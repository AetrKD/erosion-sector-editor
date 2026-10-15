import test from 'node:test';
import assert from 'node:assert/strict';
import {demoProject,readProject,placementError,connections,transformPoint,inversePoint,validate,exportStage,portError} from '../dist/core.mjs';
test('sample stage connects upper and lower horizontal doors with no layout errors',()=>{
  const p=demoProject();assert.equal(connections(p).pairs.length,6);
  assert.equal(validate(p).filter(i=>i.severity==='error').length,0);
  assert.ok(p.placements.every(q=>!placementError(p,q)));
});
test('same horizontal footprint permits separate heights and rejects multi-floor overlap',()=>{
  const p=demoProject();p.placements=[];
  const lower={id:'a',tileId:'start',x:0,y:0,z:0,rotation:0};p.placements.push(lower);
  assert.equal(placementError(p,{...lower,id:'b',y:1}),'');
  assert.ok(placementError(p,{...lower,id:'b'}));
  p.placements=[{...lower,tileId:'atrium'}];assert.ok(placementError(p,{...lower,id:'b',y:1}));
});
test('non-square tile points invert all yaw rotations including upper ports',()=>{
  const tile={size:{x:32,y:16,z:16}},point={x:32,y:9,z:8};
  for(const angle of [0,90,180,270])assert.deepEqual(inversePoint(transformPoint(point,tile,angle),tile,angle),point);
});
test('doors cannot connect across different elevations or mismatched aperture',()=>{
  const p=demoProject();p.placements.find(x=>x.id==='p6').y=2;
  assert.equal(connections(p).pairs.length,4);
  p.tiles.find(x=>x.id==='start').ports[0].width=3;
  assert.equal(connections(p).pairs.length,3);
});
test('connector dimensions and outer boundary are validated',()=>{
  const tile=demoProject().tiles[0];assert.equal(portError(tile,tile.ports[0]),'');
  assert.ok(portError(tile,{...tile.ports[0],x:15}));assert.ok(portError(tile,{...tile.ports[0],y:7}));
});
test('save and restore retain references and reject malicious/out-of-range projects',()=>{
  const p=demoProject();assert.equal(p.format,'erosionsector-project');assert.deepEqual(readProject(JSON.stringify(p)),p);const foreign=structuredClone(p);foreign.format='foreign-project';assert.throws(()=>readProject(foreign));
  const bad=structuredClone(p);bad.placements[0].rotation=45;assert.throws(()=>readProject(bad));
  const dup=structuredClone(p);dup.rooms.push(dup.rooms[0]);assert.throws(()=>readProject(dup));
  const malformed=structuredClone(p);malformed.gimmicks[0].position.x='bad';assert.throws(()=>readProject(malformed));
});
test('stage export is an explicit design draft and retains gimmick event graph',()=>{
  const out=exportStage(demoProject());assert.equal(out.format,'erosionsector-stage');assert.equal(out.runtimeReady,false);assert.equal(out.status,'draft');
  assert.equal(out.connections.length,6);assert.equal(out.links.length,2);assert.deepEqual(out.placements[0].blockPosition,{x:-32,y:0,z:0});
});
test('dangling goals and required unconnected doors produce actionable errors',()=>{
  const p=demoProject();p.placements=p.placements.filter(x=>x.id!=='p7');
  const issues=validate(p);assert.ok(issues.some(x=>x.severity==='error'&&x.message.includes('연결 필수')));
  assert.ok(issues.some(x=>x.message.includes('소속 타일')));
});
