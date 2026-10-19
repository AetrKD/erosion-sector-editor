import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeFixture} from '../tools/runtime-fixture.mjs';
import {packStage,unpackStage} from '../dist/stage-file.mjs';
import {readProject,validate} from '../dist/core.mjs';
import {scanSteps,scanDefaults} from '../dist/scan.mjs';
import {createBlock,targetOptions} from '../dist/logic.mjs';
import {objectiveTargets} from '../dist/mission.mjs';

import {scanFixture} from '../tools/scan-fixture.mjs';
test('scan sequence sizes, positions, random options and per-step requirements survive an esfile round trip',async()=>{
  const {project:p}=await scanFixture(),restored=unpackStage(packStage(p)),g=restored.gimmicks.find(g=>g.id==='security-scan');
  assert.deepEqual(g.settings,p.gimmicks.at(-1).settings);assert.equal(scanSteps(g)[1].placementId,'p1');assert.equal(scanSteps(g)[1].positionMode,'random');
  assert.deepEqual(targetOptions(p,'scan').map(([id])=>id),['exit','security-scan']);assert.deepEqual(objectiveTargets(p,'scan'),[['security-scan','보안 스캔']]);
  assert.equal(createBlock('do.scan',p).args.action,'start');assert.equal(createBlock('when.scan',p).args.state,'complete');
});
test('malformed scan configuration fails before opening the inspector or exporting',async()=>{
  for(const [key,value] of [['radius',0],['radius',17],['duration',-1],['requiredPlayers',0],['requiredPlayers',17],['requiredPlayers','2'],['positionMode','outside-world'],['steps',{}]]){
    const {project:p}=await scanFixture();p.gimmicks.at(-1).settings[key]=value;assert.throws(()=>readProject(p),/스캔|radius|duration|인원|위치|단계/);
  }
});
test('invalid continuation tile, floor and oversized random disk are shown as authored-stage errors',async()=>{
  const {project:p}=await scanFixture(),g=p.gimmicks.at(-1);g.settings.steps[0].placementId='deleted';assert.ok(validate(p).some(i=>i.message.includes('스캔 타일')));
  g.settings.steps[0].placementId='p1';g.settings.steps[0].radius=5;assert.ok(validate(p).some(i=>i.message.includes('타일보다 큰 원')));
  g.settings.steps[0].radius=1;g.settings.steps[0].position.y=1.5;assert.ok(validate(p).some(i=>i.message.includes('높이는 정수')));
});

import {scanCenter,scanMove,scanCandidates} from '../dist/authoring.mjs';
test('corner grid survives archives and rotation, legacy centers and per-step overrides remain distinct',async()=>{
  const {project:p}=await scanFixture(),g=p.gimmicks.at(-1);g.settings.centerAnchor='corner';g.settings.steps[0].centerAnchor='cell';
  const restored=unpackStage(packStage(p)),saved=restored.gimmicks.at(-1);assert.equal(scanSteps(saved)[0].centerAnchor,'corner');assert.equal(scanSteps(saved)[1].centerAnchor,'cell');
  for(const rotation of [0,90,180,270]){p.placements.find(q=>q.id===g.placementId).rotation=rotation;const step=scanSteps(g)[0],corner=scanCenter(p,step),cell=scanCenter(p,{...step,centerAnchor:'cell'});assert.equal(corner.x,Math.round(corner.x));assert.equal(corner.z,Math.round(corner.z));assert.equal(Math.hypot(cell.x-corner.x,cell.z-corner.z),Math.SQRT1_2);assert.deepEqual(scanCenter(p,{...step,centerAnchor:undefined}),cell);const moved=scanMove(p,g,0,corner);assert.deepEqual(moved.position,g.position);}
  g.settings.centerAnchor='typo';assert.throws(()=>readProject(p),/중심 기준/);
});
