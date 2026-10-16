import test from 'node:test';import assert from 'node:assert/strict';
import {runtimeFixture} from '../tools/runtime-fixture.mjs';
import {packStage,unpackStage} from '../dist/stage-file.mjs';
import {validate,readProject,emptyProject} from '../dist/core.mjs';
import {readStructure} from '../dist/nbt.mjs';
import {structureBytes} from './fixtures.mjs';
import {previewMesh} from '../dist/tile-preview.mjs';

test('supply pack counts survive stage archives and reject invalid or overflowing nine-slot contents',async()=>{
  const {project:p}=await runtimeFixture(),s=p.gimmicks.find(g=>g.id==='supply').settings;s.ammoPacks=5;s.healthPacks=3;
  const restored=unpackStage(packStage(p)).gimmicks.find(g=>g.id==='supply').settings;assert.equal(restored.ammoPacks,5);assert.equal(restored.healthPacks,3);
  for(const invalid of [-1,1.5,37,'4']){s.ammoPacks=invalid;assert.throws(()=>readProject(p),/보급 팩 수량/);}
  s.ammoPacks=33;s.healthPacks=1;assert.throws(()=>readProject(p),/9칸/);s.ammoPacks=32;s.healthPacks=4;assert.doesNotThrow(()=>readProject(p));
});
import {createBlock,programIssues,targetOptions} from '../dist/logic.mjs';
test('real external-tile mission round trips objectives, alarms, cargo and command triggers ready for the mod',async()=>{const f=await runtimeFixture();assert.equal(f.exported.runtimeReady,true);const p=unpackStage(f.bytes);assert.equal(p.missionMode,'objectives');assert.deepEqual(p.objectives,f.project.objectives);assert.equal(p.gimmicks.find(g=>g.type==='alarm').settings.distance,2);assert.equal(p.gimmicks.find(g=>g.type==='keycard').settings.containerId,'supply');assert.equal(p.programs[0].trigger.type,'when.command');assert.equal(p.tiles[0].asset.bytes,undefined);assert.deepEqual(unpackStage(packStage(p)),p);});
test('mission goals and typed event targets detect deleted objects instead of silently exporting runnable state',async()=>{const {project:p}=await runtimeFixture();p.gimmicks=p.gimmicks.filter(g=>g.id!=='computer');assert.ok(validate(p).some(i=>i.message.includes('목표 대상')));assert.ok(programIssues(p).some(i=>i.severity==='error'));assert.throws(()=>readProject({...p,objectives:[{...p.objectives[0],type:'arbitrary-code'}]}));assert.ok(validate(emptyProject()).some(i=>i.message.includes('필수 목표')));});
test('new trigger and condition defaults use their own objective and object target lists',async()=>{const {project:p}=await runtimeFixture();assert.equal(createBlock('when.command',p).args.gimmickId,'computer');assert.equal(createBlock('when.collect',p).args.gimmickId,'card');assert.equal(createBlock('when.pickup',p).args.gimmickId,'cargo');assert.equal(createBlock('when.objective',p).args.objectiveId,'restore');assert.equal(targetOptions(p,'objective').length,2);});
test('malformed lists and switches are rejected before opening device settings',async()=>{const {project:p}=await runtimeFixture();p.gimmicks.find(g=>g.id==='computer').settings.commands='not-an-array';assert.throws(()=>readProject(p));p.gimmicks.find(g=>g.id==='computer').settings.commands=[];p.gimmicks.find(g=>g.id==='alarm').settings.wake='false';assert.throws(()=>readProject(p));});
test('standalone schematic inspection does not require tile height or door markers; preview cuts and culls interior faces',async()=>{const root=await readStructure(structureBytes([2,2,1],[{Name:'minecraft:stone'}],[{pos:[0,0,0],state:0},{pos:[1,0,0],state:0},{pos:[0,1,0],state:0}]));assert.equal(previewMesh(root,1).faces,10);assert.equal(previewMesh(root,1).blocks,2);assert.equal(previewMesh(root,2).faces,14);assert.equal(previewMesh(root,2).vertices.length,14*6*6);await assert.rejects(()=>readStructure(structureBytes([257,2,1],[],[])));});
