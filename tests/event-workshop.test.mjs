import test from 'node:test';
import assert from 'node:assert/strict';
import {demoProject,emptyProject} from '../dist/core.mjs';
import {assertPrograms,createProgram,createBlock,walkBlocks} from '../dist/logic.mjs';
import {EVENT_TEMPLATES,createEventTemplate,copyEvent,eventCount,slotPath,paletteTypes} from '../dist/event-workshop.mjs';

test('templates create editable native blocks, default to existing targets and never mutate the source',()=>{
  const project=demoProject(),before=structuredClone(project),programs=EVENT_TEMPLATES.map(t=>createEventTemplate(t.id,project));assertPrograms(programs);
  assert.equal(programs[0].actions[0].args.roomId,programs[0].trigger.args.roomId);assert.equal(programs[0].actions[1].args.seconds,3);
  assert.equal(programs[1].trigger.type,'when.doorAttempt');assert.equal(programs[1].actions[0].type,'do.scan');assert.equal(programs[1].actions[0].args.action,'start');
  assert.equal(programs[2].trigger.args.state,'complete');assert.equal(programs[2].actions[0].args.action,'unlock');assert.equal(programs[3].trigger.type,'when.collect');assert.deepEqual(project,before);
  const empty=createEventTemplate('scan-unlock',emptyProject());assert.equal(empty.trigger.args.gimmickId,'');assert.equal(empty.actions[0].args.doorId,'');assert.throws(()=>createEventTemplate('missing',project));
});
test('event duplication refreshes every identity while preserving target references and original arguments',()=>{
  const project=demoProject(),program=createEventTemplate('scan-unlock',project),branch=createBlock('flow.if',project);branch.conditions.push(createBlock('check.door',project));branch.then.push(createBlock('do.door',project));program.actions.push(branch);program.name='a'.repeat(160);const before=structuredClone(program),copy=copyEvent(program,project);assertPrograms([program,copy]);
  const originalIds=new Set(),copyIds=new Set();walkBlocks(program,b=>originalIds.add(b.id));walkBlocks(copy,b=>copyIds.add(b.id));assert.equal(copyIds.size,originalIds.size);assert.ok([...copyIds].every(id=>!originalIds.has(id)));assert.notEqual(copy.id,program.id);assert.equal(copy.actions[1].then[0].args.doorId,program.actions[1].then[0].args.doorId);copy.actions[1].then[0].args.action='close';assert.deepEqual(program,before);assert.equal(copy.name.length,160);
});
test('slot breadcrumbs explain nested condition and branch locations and counts include nested blocks',()=>{
  const project=demoProject(),p=createProgram(project),branch=createBlock('flow.if',project),check=createBlock('check.all',project);branch.conditions.push(check);check.items.push(createBlock('check.players',project));branch.then.push(createBlock('do.message',project));p.actions.push(branch);
  assert.equal(eventCount(p),5);assert.equal(slotPath(p,'','actions'),'실행 동작');assert.match(slotPath(p,check.id,'items'),/실행 동작.*만약.*조건.*하위 블록/);assert.match(slotPath(p,branch.id,'else'),/아닐 때 실행/);
});
test('block search spans categories and hides terminal triggers when no terminal target exists',()=>{
  const project=demoProject();project.gimmicks=project.gimmicks.filter(g=>g.type!=='terminal');assert.ok(!paletteTypes(project,'trigger').some(([type])=>type==='when.command'));
  const matches=paletteTypes(project,'action','목표');assert.ok(matches.some(([type])=>type==='when.progress'));assert.ok(matches.some(([type])=>type==='do.objective'));assert.equal(new Set(['trigger','condition','control','action'].flatMap(c=>paletteTypes(project,c).map(([id])=>id))).size,29);assert.equal(paletteTypes(project,'action','존재하지않는블록').length,0);
});
