import test from 'node:test';
import assert from 'node:assert/strict';
import {demoProject,readProject,worldPoint} from '../dist/core.mjs';
import {createProgram,createBlock,programIssues,walkBlocks} from '../dist/logic.mjs';
import {scanFixture} from '../tools/scan-fixture.mjs';
import {createSimulation} from '../dist/simulation.mjs';
import {scanCenter,scanMove,updateScanStep,scanCandidates,duplicatePlacement,relatedPrograms} from '../dist/authoring.mjs';
import {scanSteps} from '../dist/scan.mjs';
import {encodeOccupancy} from '../dist/occupancy.mjs';
import {packStage,unpackStage} from '../dist/stage-file.mjs';
const block=(p,type,args={})=>{const b=createBlock(type,p);Object.assign(b.args,args);return b;};
const rule=(p,type,args,actions,once=true)=>({...createProgram(p),once,trigger:block(p,type,args),actions});

test('simulation chains scan objectives, extraction activation, and door unlock without changing the project',async()=>{
  const {project:p}=await scanFixture(),before=structuredClone(p),sim=createSimulation(p);
  assert.equal(sim.state.doors['p0:east'].locked,true);assert.equal(sim.state.gimmicks.exit.enabled,false);
  sim.input('when.scan','security-scan','complete');sim.advance(.1);
  assert.equal(sim.state.doors['p0:east'].locked,false);assert.equal(sim.state.objectives.secure,true);assert.equal(sim.state.gimmicks.exit.enabled,true);assert.equal(sim.state.gimmicks.exit.scan,'active');
  sim.input('when.scan','exit','complete');assert.equal(sim.state.result,'success');assert.deepEqual(p,before);
});

test('simulation respects active jobs, waits, repeated actions, conditions and one-shot events',()=>{
  const p=demoProject();p.programs=[];const wait=block(p,'flow.wait',{seconds:1}),repeat=block(p,'flow.repeat',{count:2});repeat.body=[block(p,'do.variable',{variable:'n',operation:'add',value:1})];
  const branch=block(p,'flow.if');branch.conditions=[block(p,'check.variable',{variable:'n',operator:'eq',value:2})];branch.then=[block(p,'do.tileLights',{placementId:p.placements[0].id,mode:'off'})];branch.else=[block(p,'do.mission',{result:'failure'})];
  p.programs=[rule(p,'when.signal',{signal:'go'},[wait,repeat,branch])];const s=createSimulation(p);s.input('when.signal','go');s.input('when.signal','go');assert.equal(s.state.variables.n,undefined);s.advance(.85);assert.equal(s.state.variables.n,undefined);s.advance(.15);assert.equal(s.state.variables.n,2);assert.equal(s.state.lights[p.placements[0].id],'off');s.input('when.signal','go');s.advance(2);assert.equal(s.state.variables.n,2);
});

test('composite triggers accumulate distinct events and signals execute on a subsequent tick',()=>{
  const p=demoProject(),r=rule(p,'when.all',{},[block(p,'do.signal',{signal:'done'})]);r.trigger.items=[block(p,'when.signal',{signal:'a'}),block(p,'when.signal',{signal:'b'})];
  p.programs=[r,rule(p,'when.signal',{signal:'done'},[block(p,'do.variable',{variable:'done',value:7})])];const s=createSimulation(p);s.input('when.signal','a');s.input('when.signal','a');assert.equal(s.state.variables.done,undefined);s.input('when.signal','b');assert.equal(s.state.variables.done,undefined);s.advance(.05);assert.equal(s.state.variables.done,7);
});

test('paused and stopped scans cannot be completed; reset and resume are modeled',async()=>{
  const {project:p}=await scanFixture();p.programs=[rule(p,'when.signal',{signal:'pause'},[block(p,'do.scan',{gimmickId:'security-scan',action:'pause'})]),rule(p,'when.signal',{signal:'resume'},[block(p,'do.scan',{gimmickId:'security-scan',action:'resume'})])];
  const s=createSimulation(p);s.input('when.signal','pause');s.input('when.scan','security-scan','complete');assert.equal(s.state.objectives.secure,false);s.input('when.signal','resume');s.input('when.scan','security-scan','step');assert.equal(s.state.objectives.secure,false);s.input('when.scan','security-scan','complete');assert.equal(s.state.objectives.secure,true);
});

test('simulation models per-side locking, shared door motion, and alarm completion conditions',async()=>{
  const {project:p}=await scanFixture();const cond=block(p,'flow.if');cond.conditions=[block(p,'check.door',{doorId:'p1:west',state:'open'})];cond.then=[block(p,'do.variable',{variable:'shared',value:1})];
  p.programs=[rule(p,'when.start',{},[block(p,'do.door',{doorId:'p0:east',action:'lock'}),block(p,'do.door',{doorId:'p0:east',action:'open'}),cond])];const s=createSimulation(p);assert.equal(s.state.doors['p1:west'].open,true);assert.equal(s.state.doors['p1:west'].locked,false);assert.equal(s.state.doors['p0:east'].locked,true);assert.equal(s.state.variables.shared,1);
});

test('runaway event loops are bounded and reset is a clean new simulation',()=>{
  const p=demoProject();p.programs=[rule(p,'when.start',{},[block(p,'do.signal',{signal:'loop'})]),rule(p,'when.signal',{signal:'loop'},[block(p,'do.signal',{signal:'loop'})],false)];const s=createSimulation(p);assert.doesNotThrow(()=>s.advance(60));assert.ok(s.state.log.length<=300);assert.throws(()=>s.advance(61),/60/);const fresh=createSimulation(p);assert.equal(fresh.state.tick,1);
});

test('scan center dragging is correct for each yaw and preserves floor height',async()=>{
  const {project:p}=await scanFixture(),g=p.gimmicks.find(g=>g.id==='security-scan'),placement=p.placements[0],tile=p.tiles[0];
  for(const yaw of [0,90,180,270]){placement.rotation=yaw;const w=worldPoint({x:4.5,y:1,z:4.5},tile,placement),patch=scanMove(p,g,0,w);assert.equal(patch.placementId,'p0');assert.deepEqual(patch.position,{x:4,y:1,z:4});updateScanStep(g,0,patch);assert.deepEqual(scanCenter(p,scanSteps(g)[0]),w);}
  assert.throws(()=>scanMove(p,g,0,{x:-500,y:1,z:-500}),/타일 안/);
  updateScanStep(g,1,{radius:3});assert.equal(g.settings.radius,1);assert.equal(g.settings.steps[0].radius,3);
});

test('random scan preview fits the entire disk and excludes holes, wall-separated rooms and unsupported data',()=>{
  const size={x:12,y:8,z:12},positions=[];for(let x=0;x<12;x++)for(let z=0;z<12;z++)if(x!==2||z!==2)positions.push([x,0,z]);for(let z=0;z<12;z++)positions.push([6,1,z]);
  const t={size,asset:{occupancy:encodeOccupancy(size,positions)}};const result=scanCandidates(t,1,1.5,{x:3,y:1,z:4});assert.ok(result.known);assert.ok(result.cells.some(c=>c.valid));assert.ok(result.cells.every(c=>c.x<6));assert.ok(!result.cells.find(c=>c.x===3&&c.z===3)?.valid);assert.ok(result.cells.filter(c=>c.valid).every(c=>c.x>=1&&c.x<=4&&c.z>=1&&c.z<=10));
  const corner=scanCandidates(t,1,1.5,{x:3,y:1,z:4},'corner');assert.notEqual(corner,result);assert.ok(corner.cells.some(c=>c.valid));for(const c of corner.cells.filter(c=>c.valid)){assert.ok(c.x>=1.5&&c.x+1.5<=6&&c.z>=1.5&&c.z+1.5<=12);const dx=Math.max(2-c.x,Math.max(0,c.x-3)),dz=Math.max(2-c.z,Math.max(0,c.z-3));assert.ok(dx*dx+dz*dz>=2.25);}
  assert.deepEqual(scanCandidates({size},1,1,{}),{known:false,cells:[]});assert.equal(scanCandidates(t,1,16,{x:3,y:1,z:4}).cells.filter(c=>c.valid).length,0);
});

test('bundle cloning remaps local scan steps, objectives, doors, containers, links, nested events and IDs',async()=>{
  const {project:p}=await scanFixture(),g=p.gimmicks.find(g=>g.id==='security-scan');g.settings.steps.push({placementId:'p0',position:{x:2,y:1,z:2}});p.links=[{id:'l1',from:'cargo',to:'security-scan',event:'상호작용',action:'활성화'}];
  const before=structuredClone(p),copy=duplicatePlacement(p,'p0',{x:5,y:0,z:0}),scan=p.gimmicks.find(q=>q.placementId===copy.id&&q.type==='scan');assert.equal(scan.settings.steps[0].placementId,'p1');assert.equal(scan.settings.steps[1].placementId,copy.id);const card=p.gimmicks.find(q=>q.placementId===copy.id&&q.type==='keycard');assert.equal(p.gimmicks.find(q=>q.id===card.settings.containerId).placementId,copy.id);
  assert.ok(p.objectives.some(o=>o.targetId===scan.id));assert.ok(p.programs.some(r=>r.actions.some(b=>b.type==='do.door'&&b.args.doorId===copy.id+':east')));assert.ok(p.links.some(l=>l.to===scan.id&&l.from!== 'cargo'));
  const ids=[];for(const r of p.programs){ids.push(r.id);walkBlocks(r,b=>ids.push(b.id));}assert.equal(new Set(ids).size,ids.length);assert.deepEqual(p.placements.slice(0,3),before.placements);assert.doesNotThrow(()=>readProject(p));assert.equal(programIssues(p).filter(i=>i.severity==='error').length,0);assert.deepEqual(unpackStage(packStage(p)).programs,p.programs);
  assert.throws(()=>duplicatePlacement(p,'p0',{x:0,y:0,z:0}),/겹|충돌/);
});

test('reference lookup finds objects used in nested blocks and door sides separately',async()=>{
  const {project:p}=await scanFixture();assert.equal(relatedPrograms(p,{kind:'door',id:'p0:east'}).length,2);assert.equal(relatedPrograms(p,{kind:'door',id:'p1:west'}).length,0);assert.equal(relatedPrograms(p,{kind:'gimmick',id:'security-scan'}).length,1);assert.equal(relatedPrograms(p,{kind:'placement',id:'p0'}).length,2);
});

test('tile entry models visit goals, room entry and local trigger events',async()=>{
  const {project:p}=await scanFixture();p.gimmicks.push({id:'trigger-test',name:'트리거',type:'trigger',placementId:'p1',position:{x:3,y:1,z:3},settings:{}});
  p.objectives.push({id:'visit-test',name:'방문',type:'visit',targetId:'p1',command:'',required:true});p.programs=[rule(p,'when.area',{roomId:'r1'},[block(p,'do.variable',{variable:'room',value:1})]),rule(p,'when.interact',{gimmickId:'trigger-test'},[block(p,'do.variable',{variable:'trigger',value:1})])];
  const s=createSimulation(p);s.input('when.tile','p1');assert.equal(s.state.objectives['visit-test'],true);assert.equal(s.state.variables.room,1);assert.equal(s.state.variables.trigger,1);assert.equal(s.state.players.r1,true);
});

test('deep repeated work stops at a total operation cap instead of freezing the editor',()=>{
  const p=demoProject();const outer=block(p,'flow.repeat',{count:100}),middle=block(p,'flow.repeat',{count:100}),inner=block(p,'flow.repeat',{count:100});inner.body=[block(p,'do.variable',{variable:'work',operation:'add',value:1})];middle.body=[inner];outer.body=[middle];p.programs=[rule(p,'when.start',{},[outer])];const s=createSimulation(p);s.advance(60);assert.match(s.state.error,/한도/);assert.equal(s.snapshot().pending,0);
});
