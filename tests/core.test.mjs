import test from 'node:test';
import assert from 'node:assert/strict';
import {demoProject,readProject,placementError,connections,transformPoint,inversePoint,validate,exportStage,portError,worldPorts,samePort,tileOf} from '../dist/core.mjs';

test('indexed connections preserve all-pairs results, order, tolerance and ambiguous matches',()=>{
  const p=demoProject();let seed=43;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  p.tiles=Array.from({length:4},(_,i)=>({id:`t${i}`,size:{x:16,y:8,z:16},ports:[
    {id:'w',x:0,y:1+i*.0004,z:8+i*.0004,facing:'west',width:6,height:4},
    {id:'e',x:16,y:1+i*.0004,z:8+i*.0004,facing:'east',width:6,height:4},
    {id:'n',x:8-i*.0004,y:1+i*.0004,z:0,facing:'north',width:6,height:4},
    {id:'s',x:8-i*.0004,y:1+i*.0004,z:16,facing:'south',width:i===3?5:6,height:4}
  ]}));
  p.placements=Array.from({length:90},(_,i)=>({id:`p${i}`,tileId:`t${i%4}`,x:Math.floor(random()*7)-3,y:Math.floor(random()*2)-1,z:Math.floor(random()*7)-3,rotation:Math.floor(random()*4)*90}));
  p.placements.push({...p.placements[0],id:'ambiguous'}, {...p.placements[1],id:'missing',tileId:'absent'});
  const ports=p.placements.flatMap(q=>{const tile=tileOf(p,q);return tile?worldPorts(tile,q):[];});
  const pairs=[];for(let i=0;i<ports.length;i++)for(let j=i+1;j<ports.length;j++)if(samePort(ports[i],ports[j]))pairs.push({a:ports[i],b:ports[j]});
  assert.ok(pairs.length>10);
  assert.deepEqual(connections(p),{ports,pairs,connected:new Set(pairs.flatMap(({a,b})=>[a.key,b.key]))});
  const q=demoProject();q.tiles=[{id:'t',size:{x:16,y:8,z:16},ports:[
    {id:'a',x:-.0004,y:-.0004,z:-.0004,facing:'east',width:6,height:4},
    {id:'b',x:.0004,y:.0004,z:.0004,facing:'west',width:6,height:4}
  ]}];q.placements=[{id:'a',tileId:'t',x:0,y:0,z:0,rotation:0},{id:'b',tileId:'t',x:0,y:0,z:0,rotation:0}];
  assert.equal(connections(q).pairs.length,2,'tolerance must cross negative coordinate bucket boundaries on all axes');
});
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
  const project=demoProject();project.links=[{id:'legacy-1',from:'g2',to:'g3',event:'상호작용',action:'활성화'},{id:'legacy-2',from:'g5',to:'g6',event:'목표 완료',action:'활성화'}];const out=exportStage(project);assert.equal(out.format,'erosionsector-stage');assert.equal(out.runtimeReady,false);assert.equal(out.status,'draft');
  assert.equal(out.connections.length,6);assert.equal(out.links.length,2);assert.deepEqual(out.placements[0].blockPosition,{x:-32,y:0,z:0});
});
test('dangling goals and required unconnected doors produce actionable errors',()=>{
  const p=demoProject();p.placements=p.placements.filter(x=>x.id!=='p7');
  const issues=validate(p);assert.ok(issues.some(x=>x.severity==='error'&&x.message.includes('연결 필수')));
  assert.ok(issues.some(x=>x.message.includes('소속 타일')));
});
