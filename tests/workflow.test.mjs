import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProject} from '../dist/core.mjs';
import {workflowSteps} from '../dist/workflow.mjs';

test('guidance is derived from real tile links, exact entry/exit counts and current issues',()=>{
  const p=emptyProject(),before=structuredClone(p);let steps=workflowSteps(p,[{severity:'error'}]);
  assert.equal(steps.find(s=>s.id==='tiles').done,false);assert.equal(steps.find(s=>s.id==='validation').done,false);assert.deepEqual(p,before);
  p.tiles=[{asset:{reference:'set/tile.nbt'}}];assert.equal(workflowSteps(p)[0].done,false);
  p.tiles[0].asset.bytes='AA==';p.placements=[{id:'p'}];p.gimmicks=[{type:'spawn'},{type:'extraction'}];p.missionMode='extract';
  assert.ok(workflowSteps(p).every(s=>s.done));p.gimmicks.push({type:'spawn'});assert.equal(workflowSteps(p)[2].done,false);
  p.missionMode='objectives';p.objectives=[];assert.equal(workflowSteps(p)[3].done,false);p.objectives=[{id:'goal'}];assert.equal(workflowSteps(p)[3].done,true);
  assert.equal(workflowSteps(p,[{severity:'warning'}])[4].done,false);
});
